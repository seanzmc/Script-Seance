import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharedGenres = require('../../shared/catalog/genres.json');

const loadCanonicalGenres = (value) => {
  if (!Array.isArray(value) || value.some((genre) => typeof genre !== 'string')) {
    throw new Error('shared/catalog/genres.json must be an array of strings.');
  }
  return Object.freeze([...value]);
};

export const CANONICAL_GENRES = loadCanonicalGenres(sharedGenres);

const CANONICAL_GENRE_SET = new Set(CANONICAL_GENRES);

const validateGenre = (value) => (
  typeof value === 'string' && CANONICAL_GENRE_SET.has(value)
);

export const isCanonicalGenre = (value) => validateGenre(value);
