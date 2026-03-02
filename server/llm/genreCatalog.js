export const CANONICAL_GENRES = Object.freeze([
  'Sci-Fi',
  'Noir',
  'Comedy',
  'Horror',
  'Romance',
  'Fantasy',
  'Thriller'
]);

export const CANONICAL_GENRE_SET = new Set(CANONICAL_GENRES);

export const isCanonicalGenre = (value) => (
  typeof value === 'string' && CANONICAL_GENRE_SET.has(value)
);

