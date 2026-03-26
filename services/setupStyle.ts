import { stylesLibrary } from '../stylesLibrary';

const STYLE_BY_ID = new Map(stylesLibrary.map((item) => [item.id, item]));
const STYLE_BY_NORMALIZED_TITLE = new Map(
  stylesLibrary.map((item) => [item.title.trim().toLowerCase(), item])
);

export interface SetupStyleSelectionInput {
  styleId?: string | null;
  style?: string | null;
}

export interface TitleContextInput extends SetupStyleSelectionInput {
  genre: string;
  premise: string;
  characters: string[];
  length: string;
}

export interface ResolvedSetupStyleSelection {
  styleId: string | null;
  styleName: string;
  legacyStyle: string;
}

const normalizeStyleId = (value: unknown) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

const normalizeStyleText = (value: unknown) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

export const resolveSetupStyleSelection = (
  setup: SetupStyleSelectionInput
): ResolvedSetupStyleSelection => {
  const explicitStyleId = normalizeStyleId(setup.styleId);
  const explicitStyleText = normalizeStyleText(setup.style);
  const styleFromId = explicitStyleId ? STYLE_BY_ID.get(explicitStyleId) : undefined;
  if (styleFromId) {
    return {
      styleId: styleFromId.id,
      styleName: styleFromId.title,
      legacyStyle: explicitStyleText
    };
  }
  if (!explicitStyleText) {
    return {
      styleId: null,
      styleName: '',
      legacyStyle: ''
    };
  }
  const fallbackByTitle = STYLE_BY_NORMALIZED_TITLE.get(explicitStyleText.toLowerCase());
  if (fallbackByTitle) {
    return {
      styleId: fallbackByTitle.id,
      styleName: fallbackByTitle.title,
      legacyStyle: explicitStyleText
    };
  }
  return {
    styleId: null,
    styleName: explicitStyleText,
    legacyStyle: explicitStyleText
  };
};

export const buildTitleContext = (setup: TitleContextInput) => {
  const resolvedStyle = resolveSetupStyleSelection(setup);
  const styleLabel = resolvedStyle.styleName || resolvedStyle.legacyStyle;
  const parts = [
    setup.genre ? `Genre: ${setup.genre}.` : '',
    setup.premise.trim() ? `Premise: ${setup.premise.trim()}` : '',
    setup.characters.length ? `Characters: ${setup.characters.filter(char => char.trim()).join(', ')}.` : '',
    styleLabel ? `Style: ${styleLabel}.` : '',
    setup.length.trim() ? `Length: ${setup.length.trim()}.` : ''
  ].filter(Boolean);
  return parts.join(' ');
};

export const buildPromptStyleFingerprint = (value: string) => {
  const source = value.trim();
  if (!source) return 'none';
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const sanitizeSuggestedTitle = (rawTitle: string) => {
  if (!rawTitle) return '';
  const firstLine = rawTitle.split('\n').map(line => line.trim()).find(Boolean) || '';
  const withoutLabel = firstLine.replace(/^title\s*[:-]\s*/i, '');
  const withoutQuotes = withoutLabel.replace(/^["'“”]+|["'“”]+$/g, '');
  const collapsed = withoutQuotes.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  if (/^(int|ext)\./i.test(collapsed)) return '';
  return collapsed.length > 120 ? collapsed.slice(0, 120).replace(/[,\s]+$/g, '') : collapsed;
};

export const buildFallbackTitle = (premise: string, genre: string) => {
  const words = premise
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) {
    return genre ? `${genre} Story` : '';
  }
  return words.map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};
