import { describe, expect, it } from 'vitest';
import sharedGenres from '../shared/catalog/genres.json';
import {
  CANONICAL_GENRES,
  isCanonicalGenre
} from '../server/llm/genreCatalog.js';
import { GENRES } from '../types';

describe('shared genre catalog', () => {
  it('keeps server canonical genres aligned with shared JSON', () => {
    expect(CANONICAL_GENRES).toEqual(sharedGenres);
  });

  it('includes Thriller in server canonical genres', () => {
    expect(CANONICAL_GENRES).toContain('Thriller');
    expect(isCanonicalGenre('Thriller')).toBe(true);
  });

  it('keeps client GENRES aligned with shared JSON', () => {
    expect(GENRES).toEqual(sharedGenres);
  });
});
