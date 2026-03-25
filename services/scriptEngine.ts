import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { createGenerateSpeechRequest } from './ai';
import { LruAudioCache, AUDIO_CACHE_MAX_BYTES, AUDIO_CACHE_MAX_ENTRIES } from './audioCache';
import { buildTtsBlockCacheKey, buildTtsPreviewCacheKey } from './ttsCacheKeys';
import { DEFAULT_VOICE_CONFIG } from '../shared/voiceDefaults.js';

// Global Content-Addressable Cache (persists across plays)
// Key: voiceId:text | Value: ArrayBuffer (Raw PCM)
const AudioCache = new LruAudioCache(AUDIO_CACHE_MAX_ENTRIES, AUDIO_CACHE_MAX_BYTES);
const TTS_PROVIDER = 'inworld';
const TTS_MODEL_ID = 'inworld-tts-1.5-max';
const TTS_AUDIO_ENCODING = 'LINEAR16';
const TTS_SAMPLE_RATE_HZ = 24000;
const normalizeCharacterName = (value: string) =>
  value
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*[:\-–—]+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const getDialogueSpeakerName = (block: ScriptBlock) => {
  if (block.type !== BlockType.DIALOGUE) {
    return undefined;
  }
  const legacySpeaker = (block as ScriptBlock & { speaker?: string | null }).speaker;
  const speaker = typeof block.character === 'string' && block.character.trim().length > 0
    ? block.character
    : typeof legacySpeaker === 'string' && legacySpeaker.trim().length > 0
      ? legacySpeaker
      : undefined;
  return speaker?.trim() || undefined;
};
const resolveNarratorFallbackVoiceId = (voiceConfigs: VoiceConfig[]) => {
  const narrator = voiceConfigs.find((config) => normalizeCharacterName(config.name) === 'narrator');
  if (typeof narrator?.voiceId === 'string' && narrator.voiceId.trim().length > 0) {
    return narrator.voiceId;
  }
  const firstConfiguredVoice = voiceConfigs.find((config) => typeof config.voiceId === 'string' && config.voiceId.trim().length > 0);
  return firstConfiguredVoice?.voiceId || '';
};

interface QueueItem {
  block: ScriptBlock;
  voiceId: string;
  speed: number;
  pitch: number;
  expressive: boolean;
  playbackRunId?: number;
  voiceContextRevision?: number;
}

export interface AudioChunk {
  blockId: string;
  audioBuffer: ArrayBuffer;
  voiceId: string;
  speed: number;
  pitch: number;
  expressive: boolean;
  playbackRunId?: number;
  blockRevision?: number;
  voiceContextRevision?: number;
}

export type EventHandler = (data: unknown) => void;

export class ScriptEngine {
  private queue: QueueItem[] = [];
  private activeRequests = 0;
  private concurrencyLimit = 1; // Reduced to 1 to avoid hitting strict rate limits (10 RPM)
  private isRunning = false;
  private skippedBlocks: Set<string> = new Set();
  private inflightCancels: Map<string, () => void> = new Map();
  private listeners: Map<string, EventHandler[]> = new Map();

  // --- Event System ---

  public on(event: 'audio' | 'complete' | 'error', handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(handler);
  }

  public off(event: string, handler: EventHandler) {
     const handlers = this.listeners.get(event);
     if (handlers) {
       this.listeners.set(event, handlers.filter(h => h !== handler));
     }
  }

  private emit(event: string, data: unknown) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  // --- Pipeline Control ---

  public stop(options?: { clearCache?: boolean }) {
    this.isRunning = false;
    this.queue = [];
    this.skippedBlocks.clear();
    this.abortInflight();
    if (options?.clearCache) {
      this.clearAudioCache();
    }
  }

  public clearAudioCache() {
    AudioCache.clear();
  }

  public async start(
    blocks: ScriptBlock[],
    voiceConfigs: VoiceConfig[],
    options?: { clearCache?: boolean; playbackRunId?: number; voiceContextRevision?: number }
  ) {
    this.stop({ clearCache: options?.clearCache });
    this.isRunning = true;

    // 1. Filter: Only process blocks that need audio
    const playableBlocks = blocks.filter(b => 
       [BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION].includes(b.type)
    );

    // 2. Hydrate: Assign Voice Configs upfront (Consistency)
    const narratorFallbackVoiceId = resolveNarratorFallbackVoiceId(voiceConfigs);
    this.queue = playableBlocks.map(block => {
      let config: VoiceConfig | undefined;

      const speakerName = getDialogueSpeakerName(block);
      const normalizedSpeaker = speakerName ? normalizeCharacterName(speakerName) : '';
      const isNarratorBlock = !speakerName || normalizedSpeaker === 'narrator';

      if (speakerName) {
        const target = normalizedSpeaker;
        config = voiceConfigs.find(v => normalizeCharacterName(v.name) === target);
      }

      // Fallback for narrator or truly unresolved dialogue speaker.
      if (!config && isNarratorBlock) {
        config = voiceConfigs.find(v => normalizeCharacterName(v.name) === 'narrator');
      }

      return {
        block,
        voiceId: config?.voiceId || narratorFallbackVoiceId,
        speed: config?.speed ?? DEFAULT_VOICE_CONFIG.speed,
        pitch: config?.pitch ?? DEFAULT_VOICE_CONFIG.pitch,
        expressive: config?.expressive ?? DEFAULT_VOICE_CONFIG.expressive,
        playbackRunId: options?.playbackRunId,
        voiceContextRevision: options?.voiceContextRevision
      };
    });
    this.skippedBlocks.clear();

    // 3. Start the sliding window
    this.processQueue();
  }

  // One-off generation for UI previews (uses same cache)
  public async generateSingle(
    text: string,
    voiceId: string,
    options?: { expressive?: boolean; signal?: AbortSignal; requestId?: string }
  ): Promise<ArrayBuffer> {
     const requestId = options?.requestId ?? `preview:${Date.now()}:${Math.random().toString(16).slice(2)}`;
     return this.fetchAudio({
       text,
       voiceId,
       requestId,
       expressive: options?.expressive || false,
       cacheTarget: { kind: 'preview' },
       signal: options?.signal
     });
  }

  // --- Core Processing Loop ---

  private async processQueue() {
    if (!this.isRunning) return;

    // Check completion
    if (this.queue.length === 0 && this.activeRequests === 0) {
      this.emit('complete', null);
      return;
    }

    // Fill concurrency slots (Sliding Window)
    while (this.isRunning && this.queue.length > 0 && this.activeRequests < this.concurrencyLimit) {
      const item = this.queue.shift();
      if (item) {
        this.activeRequests++;
        this.fetchQueueItem(item).finally(() => {
          this.activeRequests--;
          // Recursively fill the pipe
          this.processQueue();
        });
      }
    }
  }

  private async fetchQueueItem(item: QueueItem) {
    if (!this.isRunning) return;
    try {
      // Check cache or fetch
      const buffer = await this.fetchAudio(
        {
          text: item.block.text,
          voiceId: item.voiceId,
          requestId: item.block.id,
          expressive: item.expressive,
          cacheTarget: {
            kind: 'block',
            blockId: item.block.id,
            blockRevision: item.block.blockRevision
          }
        }
      );

      if (this.isRunning) {
        // Emit immediately for streaming playback
        this.emit('audio', {
          blockId: item.block.id,
          audioBuffer: buffer,
          voiceId: item.voiceId,
          speed: item.speed,
          pitch: item.pitch,
          expressive: item.expressive,
          playbackRunId: item.playbackRunId,
          blockRevision: item.block.blockRevision,
          voiceContextRevision: item.voiceContextRevision
        } as AudioChunk);
      }
    } catch (error: unknown) {
      if (!this.isRunning || isAbortError(error)) return;
      const blockId = item.block.id;
      if (!this.skippedBlocks.has(blockId)) {
        this.skippedBlocks.add(blockId);
        console.error("Failed to generate block", blockId, error);
        this.emit('error', {
          error,
          blockId,
          skipped: true,
          attempts: 1
        });
      }
      // We log but continue, effectively skipping the faulty block
    }
  }

  // --- AI Integration & Caching ---

  private async fetchAudio(params: {
    text: string;
    voiceId: string;
    requestId: string;
    expressive: boolean;
    signal?: AbortSignal;
    cacheTarget:
      | { kind: 'block'; blockId: string; blockRevision: number }
      | { kind: 'preview' };
  }): Promise<ArrayBuffer> {
    const { text, voiceId, requestId, expressive, cacheTarget, signal } = params;
    const safeText = text.trim();
    const keyContext = {
      provider: TTS_PROVIDER,
      modelId: TTS_MODEL_ID,
      audioEncoding: TTS_AUDIO_ENCODING,
      sampleRateHz: TTS_SAMPLE_RATE_HZ,
      voiceId,
      expressive
    };
    const cacheKey =
      cacheTarget.kind === 'block'
        ? buildTtsBlockCacheKey({
            ...keyContext,
            blockId: cacheTarget.blockId,
            blockRevision: cacheTarget.blockRevision
          })
        : buildTtsPreviewCacheKey({
            ...keyContext,
            text: safeText
          });

    const cached = AudioCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const request = createGenerateSpeechRequest(safeText, voiceId, undefined, { expressive });
    this.inflightCancels.set(requestId, request.cancel);
    const abortRequest = () => request.cancel();
    if (signal) {
      if (signal.aborted) {
        request.cancel();
      } else {
        signal.addEventListener('abort', abortRequest, { once: true });
      }
    }

    try {
      const buffer = await request.promise;

      // Write to Cache
      AudioCache.set(cacheKey, buffer);
      return buffer;
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortRequest);
      }
      this.inflightCancels.delete(requestId);
    }
  }

  private abortInflight() {
    this.inflightCancels.forEach((cancel) => {
      try {
        cancel();
      } catch {
        // Ignore abort errors for already-completed requests.
      }
    });
    this.inflightCancels.clear();
  }
}

const isAbortError = (error: unknown) => {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  return (
    record.name === 'AbortError' ||
    record.code === 'ABORT_ERR' ||
    record.code === 'REQUEST_ABORTED'
  );
};
