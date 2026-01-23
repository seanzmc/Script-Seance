import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { generateSpeech } from './gemini';

// Global Content-Addressable Cache (persists across plays)
// Key: voiceId:text | Value: ArrayBuffer (Raw PCM)
const AudioCache = new Map<string, ArrayBuffer>();

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

type EventHandler = (data: any) => void;

export class ScriptEngine {
  private queue: QueueItem[] = [];
  private activeRequests = 0;
  private concurrencyLimit = 1; // Reduced to 1 to avoid hitting strict rate limits (10 RPM)
  private isRunning = false;
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

  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  // --- Pipeline Control ---

  public stop() {
    this.isRunning = false;
    this.queue = [];
    // Note: We deliberately do NOT clear AudioCache so re-plays are instant
  }

  public async start(blocks: ScriptBlock[], voiceConfigs: VoiceConfig[]) {
    this.stop();
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

    // 3. Start the sliding window
    this.processQueue();
  }

  // One-off generation for UI previews (uses same cache)
  public async generateSingle(text: string, voiceId: string): Promise<ArrayBuffer> {
     return this.fetchAudio(text, voiceId);
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
      const buffer = await this.fetchAudio(item.block.text, item.voiceId);
      
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
    } catch (e) {
      console.error("Failed to generate block", item.block.id, e);
      // We log but continue, effectively skipping the faulty block
    }
  }

  // --- Gemini Integration & Caching ---

  private async fetchAudio(text: string, voiceId: string, retryCount = 0): Promise<ArrayBuffer> {
    const safeText = text.trim();
    // Cache Key: VoiceID + Text. 
    // Speed/Pitch are applied client-side (AudioContext), so they don't affect the raw API request.
    const cacheKey = `${voiceId}:${safeText}`;

    if (AudioCache.has(cacheKey)) {
      return AudioCache.get(cacheKey)!;
    }

    try {
      const buffer = await generateSpeech(safeText, voiceId);

      // Write to Cache
      AudioCache.set(cacheKey, buffer);
      return buffer;
    } catch (e: any) {
       // Handle Rate Limiting (429)
       const isRateLimit =
         e.message?.includes('429') ||
         e.status === 429 ||
         e.code === 429 ||
         e.code === 'RATE_LIMITED' ||
         e.message?.includes('RESOURCE_EXHAUSTED');
       
       if (isRateLimit && retryCount < 4) {
         let delayMs = 3000 * Math.pow(2, retryCount); // Default: 3s, 6s, 12s, 24s
         
         // Extract specific retry delay if available from message "Please retry in X s."
         const match = e.message?.match(/retry in ([\d\.]+)s/);
         if (match && match[1]) {
            delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // +1s buffer
         }
 
         console.warn(`[ScriptEngine] Rate limit hit. Retrying in ${delayMs}ms... (Attempt ${retryCount + 1})`);
         
         await new Promise(resolve => setTimeout(resolve, delayMs));
         
         // If we are stopping, abort retries to prevent zombie requests
         if (!this.isRunning && retryCount === 0) {
            throw new Error("Engine stopped during retry backoff");
         }

         return this.fetchAudio(text, voiceId, retryCount + 1);
       }
       
       throw e;
    }
  }
}
