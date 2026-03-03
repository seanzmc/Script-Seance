import { BlockType, ScriptBlock } from '../types';

type CreateBlockParams = {
  type: BlockType;
  text: string;
  character?: string | null;
  parenthetical?: string | null;
};

type UpdateBlockPatch = Partial<Pick<ScriptBlock, 'text' | 'character' | 'parenthetical' | 'locked'>>;

const LEADING_TYPE_LABEL_PATTERN = /^\s*(action|dialogue|transition|scene heading)\s*:\s*/i;

const stripLeadingTypeLabel = (value: string) => value.replace(LEADING_TYPE_LABEL_PATTERN, '');

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

export const createBlock = (params: CreateBlockParams): ScriptBlock => {
  const text = sanitizeBlockText(params.text);
  if (params.type === BlockType.DIALOGUE) {
    const character = normalizeRequiredCharacter(params.character);
    const parenthetical = normalizeOptionalValue(params.parenthetical);
    return {
      id: crypto.randomUUID(),
      type: params.type,
      text,
      blockRevision: 1,
      character,
      ...(parenthetical ? { parenthetical } : {})
    };
  }
  return {
    id: crypto.randomUUID(),
    type: params.type,
    text,
    blockRevision: 1
  };
};

export const updateBlock = (block: ScriptBlock, patch: UpdateBlockPatch): ScriptBlock => {
  const nextTextInput = patch.text ?? block.text;
  const nextCharacterInput = patch.character ?? block.character;
  const nextParentheticalInput = patch.parenthetical ?? block.parenthetical;

  const text = sanitizeBlockText(nextTextInput);
  const semanticBase = block.type === BlockType.DIALOGUE
    ? {
        character: normalizeRequiredCharacter(nextCharacterInput),
        parenthetical: normalizeOptionalValue(nextParentheticalInput)
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

  const nextBlockRevision = semanticChanged ? block.blockRevision + 1 : block.blockRevision;
  return {
    ...block,
    ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
    text,
    character: semanticBase.character,
    parenthetical: semanticBase.parenthetical,
    blockRevision: nextBlockRevision,
  };
};
