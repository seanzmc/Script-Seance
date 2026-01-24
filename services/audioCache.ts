export const AUDIO_CACHE_MAX_ENTRIES = 50;
export const AUDIO_CACHE_MAX_BYTES = 50 * 1024 * 1024;

type AudioCacheEntry = {
  buffer: ArrayBuffer;
  byteLength: number;
};

export class LruAudioCache {
  private entries = new Map<string, AudioCacheEntry>();
  private totalBytes = 0;

  constructor(
    private maxEntries: number = AUDIO_CACHE_MAX_ENTRIES,
    private maxBytes: number = AUDIO_CACHE_MAX_BYTES
  ) {}

  get(key: string): ArrayBuffer | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    // Refresh LRU order on read.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.buffer;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(key: string, buffer: ArrayBuffer) {
    const byteLength = buffer.byteLength;
    const existing = this.entries.get(key);

    if (existing) {
      this.totalBytes -= existing.byteLength;
      this.entries.delete(key);
    }

    this.entries.set(key, { buffer, byteLength });
    this.totalBytes += byteLength;
    this.evictIfNeeded();
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  getStats() {
    return {
      entries: this.entries.size,
      totalBytes: this.totalBytes
    };
  }

  private evictIfNeeded() {
    while (this.entries.size > this.maxEntries && this.entries.size > 0) {
      this.evictOldest();
    }

    while (this.totalBytes > this.maxBytes && this.entries.size > 0) {
      this.evictOldest();
    }
  }

  private evictOldest() {
    const oldestKey = this.entries.keys().next().value as string | undefined;
    if (!oldestKey) {
      return;
    }

    const entry = this.entries.get(oldestKey);
    if (entry) {
      this.totalBytes -= entry.byteLength;
    }
    this.entries.delete(oldestKey);
  }
}
