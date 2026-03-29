import {
  BlockType,
  ScriptBlock,
  ScriptBlockMeta,
  ScriptBlockOrigin
} from '../types';

type CreateBlockParams = {
  type: BlockType;
  text: string;
  character?: string | null;
  parenthetical?: string | null;
  meta?: ScriptBlockMeta | null;
};

type UpdateBlockPatch = Partial<Pick<ScriptBlock, 'text' | 'character' | 'parenthetical'>>;
type BlockFieldRule = {
  storedInSceneBlocks: boolean;
  requiresCharacter: boolean;
  allowsCharacter: boolean;
  allowsParenthetical: boolean;
};

type NormalizeSceneBlockOptions = {
  fallbackDialogueCharacter?: string | null;
};

const VALID_META_ORIGINS = new Set<ScriptBlockOrigin>(['ai', 'user', 'rewrite']);

const BLOCK_TYPE_FIELD_RULES: Record<BlockType, BlockFieldRule> = {
  [BlockType.HEADING]: {
    storedInSceneBlocks: false,
    requiresCharacter: false,
    allowsCharacter: false,
    allowsParenthetical: false
  },
  [BlockType.ACTION]: {
    storedInSceneBlocks: true,
    requiresCharacter: false,
    allowsCharacter: false,
    allowsParenthetical: false
  },
  [BlockType.DIALOGUE]: {
    storedInSceneBlocks: true,
    requiresCharacter: true,
    allowsCharacter: true,
    allowsParenthetical: true
  },
  [BlockType.TRANSITION]: {
    storedInSceneBlocks: true,
    requiresCharacter: false,
    allowsCharacter: false,
    allowsParenthetical: false
  }
};

const LEADING_TYPE_LABEL_PATTERN = /^\s*(action|dialogue|transition|scene heading)\s*:\s*/i;

const stripLeadingTypeLabel = (value: string) => value.replace(LEADING_TYPE_LABEL_PATTERN, '');

const normalizeBlockId = (value: string | null | undefined) => {
  const normalized = normalizeOptionalValue(value);
  return normalized ?? crypto.randomUUID();
};

const normalizeBlockRevision = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 1
);

const normalizeOptionalValue = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeRequiredCharacter = (value: string | null | undefined): string => {
  const normalized = normalizeOptionalValue(value);
  if (!normalized) {
    throw new Error('Dialogue blocks require a character.');
  }
  return normalized;
};

const sanitizeBlockText = (value: string) => stripLeadingTypeLabel(value).trim();
const normalizeBlockMeta = (value: ScriptBlockMeta | null | undefined): ScriptBlockMeta | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const origin = VALID_META_ORIGINS.has(value.origin as ScriptBlockOrigin)
    ? value.origin
    : undefined;
  const createdAt = normalizeOptionalValue(value.createdAt);
  const opId = normalizeOptionalValue(value.opId);

  if (!origin && !createdAt && !opId) {
    return undefined;
  }

  return {
    ...(origin ? { origin } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(opId ? { opId } : {})
  };
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const toSingleSentence = (value: string) => {
  const compact = collapseWhitespace(value);
  if (!compact) return '';
  const sentenceMatch = compact.match(/^(.+?[.!?])(?:\s|$)/);
  return sentenceMatch?.[1]?.trim() || compact;
};

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const removeDialogueSpeakerPrefix = (value: string, character: string) => {
  const escaped = escapeRegExp(character.trim());
  if (!escaped) return value.trim();

  const withColonRemoved = value.replace(new RegExp(`^${escaped}\\s*[:\\-–—]\\s*`, 'i'), '');
  const lines = withColonRemoved
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const firstLineNormalized = normalizeCharacterName(lines[0]);
    if (firstLineNormalized === normalizeCharacterName(character)) {
      return lines.slice(1).join(' ');
    }
  }
  return lines.join(' ');
};

const looksLikeTransition = (line: string) =>
  /^(CUT TO|SMASH CUT TO|MATCH CUT TO|DISSOLVE TO|FADE IN|FADE OUT|WIPE TO|JUMP CUT TO)\b/i.test(line) ||
  /:\s*$/.test(line);

const looksLikeSpeakerLabel = (line: string) =>
  /^[A-Z][A-Z0-9 .'\-()]{1,40}$/.test(line) || /^[A-Z][A-Z0-9 .'\-()]{1,40}\s*:/.test(line);

export const sanitizeGeneratedText = (
  type: BlockType,
  rawText: string,
  character?: string
): string => {
  const withoutTypeLabel = stripLeadingTypeLabel(rawText);
  const trimmed = withoutTypeLabel.trim();
  if (!trimmed) return '';

  if (type === BlockType.DIALOGUE) {
    const withoutSpeaker = character ? removeDialogueSpeakerPrefix(trimmed, character) : trimmed;
    const noQuotes = withoutSpeaker.replace(/^["'“”]+|["'“”]+$/g, '');
    return collapseWhitespace(noQuotes);
  }

  if (type === BlockType.ACTION) {
    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const filtered = lines.filter((line) => !looksLikeTransition(line) && !looksLikeSpeakerLabel(line));
    const base = filtered[0] || lines[0] || '';
    return toSingleSentence(base);
  }

  if (type === BlockType.HEADING || type === BlockType.TRANSITION) {
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)[0] || '';
  }

  return collapseWhitespace(trimmed);
};

export const normalizeSceneHeading = (value: string | null | undefined): string => {
  const normalized = sanitizeBlockText(value ?? '');
  return normalized ? normalized.toUpperCase() : '';
};

export const normalizeSceneBlock = (
  block: ScriptBlock,
  options: NormalizeSceneBlockOptions = {}
): ScriptBlock | null => {
  const rule = BLOCK_TYPE_FIELD_RULES[block.type];
  if (!rule.storedInSceneBlocks) {
    return null;
  }
  const meta = normalizeBlockMeta(block.meta);

  const base = {
    id: normalizeBlockId(block.id),
    type: block.type,
    text: sanitizeBlockText(block.text),
    blockRevision: normalizeBlockRevision(block.blockRevision),
    ...(meta ? { meta } : {})
  };

  if (rule.requiresCharacter) {
    const character = normalizeOptionalValue(block.character)
      ?? normalizeOptionalValue(options.fallbackDialogueCharacter)
      ?? 'Narrator';
    const parenthetical = normalizeOptionalValue(block.parenthetical);

    return {
      ...base,
      character,
      ...(parenthetical ? { parenthetical } : {})
    };
  }

  return base;
};

export const normalizeSceneBlocks = (
  blocks: ScriptBlock[],
  options: NormalizeSceneBlockOptions = {}
): ScriptBlock[] => (
  blocks.reduce<ScriptBlock[]>((acc, block) => {
    const normalized = normalizeSceneBlock(block, options);
    if (normalized) {
      acc.push(normalized);
    }
    return acc;
  }, [])
);

export const createBlock = (params: CreateBlockParams): ScriptBlock => {
  const meta = normalizeBlockMeta(params.meta);
  const text = sanitizeBlockText(params.text);
  const rule = BLOCK_TYPE_FIELD_RULES[params.type];
  if (rule.requiresCharacter) {
    const character = normalizeRequiredCharacter(params.character);
    const parenthetical = rule.allowsParenthetical
      ? normalizeOptionalValue(params.parenthetical)
      : undefined;
    return {
      id: crypto.randomUUID(),
      type: params.type,
      text,
      blockRevision: 1,
      character,
      ...(parenthetical ? { parenthetical } : {}),
      ...(meta ? { meta } : {})
    };
  }
  return {
    id: crypto.randomUUID(),
    type: params.type,
    text,
    blockRevision: 1,
    ...(meta ? { meta } : {})
  };
};

export const updateBlock = (block: ScriptBlock, patch: UpdateBlockPatch): ScriptBlock => {
  const nextTextInput = patch.text ?? block.text;
  const nextCharacterInput = patch.character ?? block.character;
  const nextParentheticalInput = patch.parenthetical ?? block.parenthetical;

  const text = sanitizeBlockText(nextTextInput);
  const rule = BLOCK_TYPE_FIELD_RULES[block.type];
  const semanticBase = rule.requiresCharacter
    ? {
        character: normalizeRequiredCharacter(nextCharacterInput),
        parenthetical: rule.allowsParenthetical
          ? normalizeOptionalValue(nextParentheticalInput)
          : undefined
      }
    : {
        character: undefined,
        parenthetical: undefined
      };

  const semanticChanged = (
    text !== block.text ||
    semanticBase.character !== block.character ||
    semanticBase.parenthetical !== block.parenthetical
  );

  const currentBlockRevision = normalizeBlockRevision(block.blockRevision);
  const nextBlockRevision = semanticChanged ? currentBlockRevision + 1 : currentBlockRevision;
  const normalizedMeta = normalizeBlockMeta(block.meta);
  return {
    ...block,
    text,
    character: semanticBase.character,
    parenthetical: semanticBase.parenthetical,
    blockRevision: nextBlockRevision,
    meta: normalizedMeta,
  };
};
