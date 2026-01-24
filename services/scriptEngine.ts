import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { createGenerateSpeechRequest } from './gemini';
import { LruAudioCache, AUDIO_CACHE_MAX_BYTES, AUDIO_CACHE_MAX_ENTRIES } from './audioCache';

// Global Content-Addressable Cache (persists across plays)
// Key: voiceId:text | Value: ArrayBuffer (Raw PCM)
const AudioCache = new LruAudioCache(AUDIO_CACHE_MAX_ENTRIES, AUDIO_CACHE_MAX_BYTES);

interface QueueItem {
  block: ScriptBlock;
  voiceId: string;
  speed: number;
  pitch: number;
}

export interface AudioChunk {
  blockId: string;
  audioBuffer: ArrayBuffer;
  voiceId: string;
  speed: number;
  pitch: number;
}

type EventHandler = (data: unknown) => void;

const getErrorMeta = (error: unknown) => {
  let message: string | undefined;
  let status: number | undefined;
  let code: string | number | undefined;

  if (error instanceof Error) {
    message = error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const recordMessage = record.message;
    const recordStatus = record.status;
    const recordCode = record.code;

    if (typeof recordMessage === 'string') {
      message = recordMessage;
    }
    if (typeof recordStatus === 'number') {
      status = recordStatus;
    }
    if (typeof recordCode === 'string' || typeof recordCode === 'number') {
      code = recordCode;
    }
  }

  return { message, status, code };
};

export class ScriptEngine {
  private queue: QueueItem[] = [];
  private activeRequests = 0;
  private concurrencyLimit = 1; // Reduced to 1 to avoid hitting strict rate limits (10 RPM)
  private isRunning = false;
  private maxBlockRetries = 1;
  private blockRetryCounts: Map<string, number> = new Map();
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
    this.blockRetryCounts.clear();
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
    options?: { clearCache?: boolean }
  ) {
    this.stop({ clearCache: options?.clearCache });
    this.isRunning = true;

    // 1. Filter: Only process blocks that need audio
    const playableBlocks = blocks.filter(b => 
       [BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION].includes(b.type)
    );

    // 2. Hydrate: Assign Voice Configs upfront (Consistency)
    this.queue = playableBlocks.map(block => {
      let config: VoiceConfig | undefined;
      
      if (block.type === BlockType.DIALOGUE && block.character) {
        const target = block.character.toLowerCase().trim();
        config = voiceConfigs.find(v => v.name.toLowerCase().trim() === target);
      }
      
      // Fallback for narrator or missing config
      if (!config) {
        config = voiceConfigs.find(v => v.name === 'Narrator');
      }

      return {
        block,
        voiceId: config?.voiceId || 'Zephyr',
        speed: config?.speed || 1,
        pitch: config?.pitch || 0
      };
    });
    this.blockRetryCounts.clear();
    this.skippedBlocks.clear();

    // 3. Start the sliding window
    this.processQueue();
  }

  // One-off generation for UI previews (uses same cache)
  public async generateSingle(text: string, voiceId: string): Promise<ArrayBuffer> {
     const requestId = `preview:${Date.now()}:${Math.random().toString(16).slice(2)}`;
     return this.fetchAudio(text, voiceId, requestId);
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
      const buffer = await this.fetchAudio(item.block.text, item.voiceId, item.block.id);
      this.blockRetryCounts.delete(item.block.id);

      if (this.isRunning) {
        // Emit immediately for streaming playback
        this.emit('audio', {
          blockId: item.block.id,
          audioBuffer: buffer,
          voiceId: item.voiceId,
          speed: item.speed,
          pitch: item.pitch
        } as AudioChunk);
      }
    } catch (error: unknown) {
      if (!this.isRunning || isAbortError(error)) return;
      const blockId = item.block.id;
      const retryCount = this.blockRetryCounts.get(blockId) ?? 0;

      if (retryCount < this.maxBlockRetries) {
        this.blockRetryCounts.set(blockId, retryCount + 1);
        console.warn(`[ScriptEngine] Retry ${retryCount + 1}/${this.maxBlockRetries} for block ${blockId}`);
        return this.fetchQueueItem(item);
      }

      this.blockRetryCounts.delete(blockId);
      if (!this.skippedBlocks.has(blockId)) {
        this.skippedBlocks.add(blockId);
        console.error("Failed to generate block", blockId, error);
        this.emit('error', {
          error,
          blockId,
          skipped: true,
          attempts: retryCount + 1
        });
      }
      // We log but continue, effectively skipping the faulty block
    }
  }

  // --- Gemini Integration & Caching ---

  private async fetchAudio(
    text: string,
    voiceId: string,
    requestId: string,
    retryCount = 0
  ): Promise<ArrayBuffer> {
    const safeText = text.trim();
    // Cache Key: VoiceID + Text. 
    // Speed/Pitch are applied client-side (AudioContext), so they don't affect the raw API request.
    const cacheKey = `${voiceId}:${safeText}`;

    const cached = AudioCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const request = createGenerateSpeechRequest(safeText, voiceId);
    this.inflightCancels.set(requestId, request.cancel);

    try {
      const buffer = await request.promise;

      // Write to Cache
      AudioCache.set(cacheKey, buffer);
      return buffer;
    } catch (error: unknown) {
       if (isAbortError(error)) {
         throw error;
       }
       // Handle Rate Limiting (429)
       const { message, status, code } = getErrorMeta(error);
       const isRateLimit =
         message?.includes('429') ||
         status === 429 ||
         code === 429 ||
         code === 'RATE_LIMITED' ||
         message?.includes('RESOURCE_EXHAUSTED');
       
       if (isRateLimit && retryCount < 4) {
         let delayMs = 3000 * Math.pow(2, retryCount); // Default: 3s, 6s, 12s, 24s
         
         // Extract specific retry delay if available from message "Please retry in X s."
         const match = message?.match(/retry in ([\d.]+)s/);
         if (match && match[1]) {
            delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // +1s buffer
         }
 
         console.warn(`[ScriptEngine] Rate limit hit. Retrying in ${delayMs}ms... (Attempt ${retryCount + 1})`);
         
         await new Promise(resolve => setTimeout(resolve, delayMs));
         
         // If we are stopping, abort retries to prevent zombie requests
         if (!this.isRunning && retryCount === 0) {
            throw new Error("Engine stopped during retry backoff");
         }

         return this.fetchAudio(text, voiceId, requestId, retryCount + 1);
       }
       
       throw error;
    } finally {
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
  const { code, message } = getErrorMeta(error);
  return code === 'REQUEST_ABORTED' || message === 'Request canceled.';
};
