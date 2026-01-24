import { describe, it, expect } from 'vitest';
import { LruAudioCache } from '../services/audioCache';

const makeBuffer = (size: number) => new ArrayBuffer(size);

describe('LruAudioCache', () => {
  it('evicts the least recently used entry when over limits', () => {
    const cache = new LruAudioCache(5, 24);

    cache.set('a', makeBuffer(10));
    cache.set('b', makeBuffer(10));
    cache.get('a'); // a is most recently used
    cache.set('c', makeBuffer(10)); // total 30 > 24, evict b

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });
});
