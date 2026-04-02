import { StyleItem, stylesLibrary } from '../stylesLibrary';

const normalizeStyleValue = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

export const resolveSelectedLibraryStyle = (
  styleId?: string | null,
  styleTitle?: string
): StyleItem | null => {
  const normalizedId = styleId?.trim() ?? '';
  if (normalizedId) {
    const byId = stylesLibrary.find((item) => item.id === normalizedId);
    if (byId) return byId;
  }
  const normalizedTitle = normalizeStyleValue(styleTitle);
  if (!normalizedTitle) return null;
  return stylesLibrary.find((item) => normalizeStyleValue(item.title) === normalizedTitle) ?? null;
};
