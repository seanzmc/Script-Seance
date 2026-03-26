import { normalizeSceneBlocks, normalizeSceneHeading } from '../domain/blocks';
import { BlockType, Scene, SceneLengthOption, StoryContext } from '../types';

const SCENE_LENGTH_OPTIONS = new Set<SceneLengthOption>(['Short', 'Medium', 'Long']);

export const normalizeTargetLength = (value: unknown): SceneLengthOption => (
  typeof value === 'string' && SCENE_LENGTH_OPTIONS.has(value as SceneLengthOption)
    ? value as SceneLengthOption
    : 'Medium'
);

export const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

export const resolveCharacterName = (
  value: string | null | undefined,
  characters: string[]
) => {
  if (!value) return value ?? undefined;
  const normalized = normalizeCharacterName(value);
  const match = characters.find((character) => normalizeCharacterName(character) === normalized);
  return match ?? value;
};

export const normalizeSceneCharacters = (scene: Scene, characters: string[]): Scene => {
  const legacyHeadingBlock = scene.blocks.find((block) => block.type === BlockType.HEADING);
  const normalizedHeading = normalizeSceneHeading(scene.heading) || normalizeSceneHeading(legacyHeadingBlock?.text);
  const fallbackDialogueCharacter = characters.find((character) => character.trim()) || 'Narrator';
  const normalizedBlocks = normalizeSceneBlocks(scene.blocks, { fallbackDialogueCharacter })
    .map((block) => {
      if (block.type !== BlockType.DIALOGUE) {
        return block;
      }
      const resolvedCharacter = resolveCharacterName(block.character, characters) ?? block.character;
      return resolvedCharacter === block.character
        ? block
        : { ...block, character: resolvedCharacter };
    });

  return {
    ...scene,
    heading: normalizedHeading,
    blocks: normalizedBlocks
  };
};

export const isStoryContext = (value: unknown): value is StoryContext => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const style = record.style;
  const styleId = record.styleId;
  const targetLength = record.targetLength;
  const styleOk = style === undefined || style === null || typeof style === 'string';
  const styleIdOk = styleId === undefined || styleId === null || typeof styleId === 'string';
  const targetLengthOk =
    targetLength === undefined ||
    targetLength === null ||
    (typeof targetLength === 'string' && SCENE_LENGTH_OPTIONS.has(targetLength as SceneLengthOption));
  return (
    typeof record.title === 'string' &&
    typeof record.genre === 'string' &&
    typeof record.premise === 'string' &&
    Array.isArray(record.characters) &&
    Array.isArray(record.scenes) &&
    styleOk &&
    styleIdOk &&
    targetLengthOk
  );
};
