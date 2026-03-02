import { readFileSync } from 'node:fs';
import path from 'node:path';

const STYLE_LIBRARY_PATH = path.resolve(process.cwd(), 'styleLibrary.json');

const safeLoadStyles = () => {
  try {
    const raw = readFileSync(STYLE_LIBRARY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const styles = Array.isArray(parsed?.styles) ? parsed.styles : [];
    return styles.filter((item) => (
      item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      item.id.trim().length > 0 &&
      typeof item.title === 'string' &&
      typeof item.description === 'string'
    ));
  } catch (error) {
    console.warn('[style-catalog] failed to load styleLibrary.json', {
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
};

const STYLE_ITEMS = safeLoadStyles();
const STYLE_BY_ID = new Map(STYLE_ITEMS.map((item) => [item.id, item]));

export const resolveLibraryStyleById = (styleId) => {
  if (typeof styleId !== 'string') return null;
  const normalized = styleId.trim();
  if (!normalized) return null;
  return STYLE_BY_ID.get(normalized) || null;
};
