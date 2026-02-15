import { BlockType, Scene, ScriptBlock, StoryContext } from '../types';

export type LLMBlockType = 'scene-heading' | 'action' | 'dialogue' | 'transition' | 'parenthetical';

export interface LLMSceneBlock {
  id: string;
  type: LLMBlockType;
  content: string;
  sceneIndex?: number;
}

export interface LLMCharacter {
  name: string;
}

export interface LLMScriptState {
  title: string;
  characters: LLMCharacter[];
  style: {
    genre: string;
    tone: string;
  };
  plotThreads: Array<{
    id: string;
    description: string;
    status: 'active' | 'resolved' | 'background';
  }>;
  canonFacts: Array<{ fact: string }>;
  currentSceneOutline?: string;
  totalScenes: number;
}

export interface ContinueAction {
  type: 'continue';
  instruction?: string;
}

export interface LLMContinueInput {
  action: ContinueAction;
  scriptState: LLMScriptState;
  blocks: LLMSceneBlock[];
  callbackNotes: string[];
}

const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i;
const TRANSITION_RE = /^(CUT TO:|FADE OUT\.?|FADE TO BLACK\.?|SMASH CUT:|DISSOLVE TO:|MATCH CUT:|WIPE TO:|BACK TO:)/i;
const ACTION_DIALOGUE_BREAK_RE =
  /^(THE |A |AN |SUDDENLY|OUTSIDE|INSIDE|ON |IN |AT |WITH |WITHOUT |NEAR |FROM |BEHIND )/i;

const normalizeLine = (line: string) => line.replace(/\s+/g, ' ').trim();

const makeSummary = (text: string, fallback: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177).trimEnd()}...`;
};

const formatDialogueContent = (block: ScriptBlock) => {
  const lines = [(block.character || 'UNKNOWN').trim().toUpperCase()];
  if (block.parenthetical?.trim()) {
    lines.push(`(${block.parenthetical.trim()})`);
  }
  lines.push(block.text.trim());
  return lines.join('\n');
};

const mapBlockType = (block: ScriptBlock): LLMBlockType => {
  switch (block.type) {
    case BlockType.HEADING:
      return 'scene-heading';
    case BlockType.ACTION:
      return 'action';
    case BlockType.DIALOGUE:
      return 'dialogue';
    case BlockType.TRANSITION:
      return 'transition';
    default:
      return 'action';
  }
};

const isLikelyCharacterCue = (line: string) => {
  const normalized = line.trim();
  if (!normalized) return false;
  if (SCENE_HEADING_RE.test(normalized)) return false;
  if (TRANSITION_RE.test(normalized)) return false;
  if (normalized.length > 42) return false;
  if (/[.!?:]$/.test(normalized)) return false;
  if (!/[A-Z]/.test(normalized)) return false;
  return normalized === normalized.toUpperCase();
};

const isParenthetical = (line: string) => /^\(.*\)$/.test(line.trim());

const buildCharacterPattern = (characters: string[]) => {
  const tokens = characters
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length === 0) return null;
  return new RegExp(`^(${tokens.join('|')})\\b\\s+`, 'i');
};

const isLikelyActionAfterDialogue = (
  line: string,
  characterPattern: RegExp | null
) => {
  const normalized = line.trim();
  if (!normalized) return false;
  if (isParenthetical(normalized)) return false;
  if (SCENE_HEADING_RE.test(normalized)) return false;
  if (TRANSITION_RE.test(normalized)) return false;
  if (isLikelyCharacterCue(normalized)) return false;

  // Narrative/action lines often begin with environment cues or articles.
  if (ACTION_DIALOGUE_BREAK_RE.test(normalized)) return true;

  // If a full narrative sentence starts with a known character name + verb,
  // treat it as action instead of dialogue continuation.
  if (
    characterPattern &&
    characterPattern.test(normalized) &&
    /[a-z]/.test(normalized) &&
    /[.!?]$/.test(normalized)
  ) {
    return true;
  }

  return false;
};

export const extractSceneHeading = (text: string): string | null => {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean);
  const heading = lines.find((line) => SCENE_HEADING_RE.test(line));
  return heading ? heading.toUpperCase() : null;
};

export const buildContinueGenerationInput = (
  context: StoryContext,
  instruction: string,
  toneHint?: string
): LLMContinueInput => {
  const flattenedBlocks: LLMSceneBlock[] = [];

  context.scenes.forEach((scene, sceneIndex) => {
    if (scene.heading?.trim()) {
      flattenedBlocks.push({
        id: `${scene.id}-heading`,
        type: 'scene-heading',
        content: scene.heading.trim(),
        sceneIndex
      });
    }

    scene.blocks.forEach((block) => {
      const mappedType = mapBlockType(block);
      const content =
        mappedType === 'dialogue'
          ? formatDialogueContent(block)
          : block.text?.trim() ?? '';

      if (!content) return;

      flattenedBlocks.push({
        id: block.id,
        type: mappedType,
        content,
        sceneIndex
      });
    });
  });

  const plotThreads = context.scenes
    .slice(-5)
    .map((scene, index) => ({
      id: `thread-${index}`,
      description: scene.summary?.trim() || `Scene ${context.scenes.length - (4 - index)} progression`,
      status: 'active' as const
    }));

  const canonFacts = context.scenes
    .slice(-8)
    .map((scene) => ({ fact: scene.summary?.trim() || scene.heading?.trim() || 'Scene event established' }));

  const callbackNotes = context.scenes
    .slice(-4)
    .map((scene) => scene.summary?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    action: {
      type: 'continue',
      instruction
    },
    scriptState: {
      title: context.title,
      characters: context.characters.map((name) => ({ name })),
      style: {
        genre: context.genre,
        tone: toneHint?.trim() || 'cinematic'
      },
      plotThreads,
      canonFacts,
      currentSceneOutline: instruction,
      totalScenes: context.scenes.length
    },
    blocks: flattenedBlocks,
    callbackNotes
  };
};

export const parseGeneratedSceneText = (
  rawText: string,
  options: { fallbackHeading: string; summaryHint?: string; characters?: string[] }
): Omit<Scene, 'id'> => {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^===/.test(line.trim()));

  let heading = options.fallbackHeading;
  const blocks: ScriptBlock[] = [];
  const characterPattern = buildCharacterPattern(options.characters ?? []);

  let i = 0;
  while (i < lines.length) {
    const line = normalizeLine(lines[i]);
    if (!line) {
      i += 1;
      continue;
    }

    if (SCENE_HEADING_RE.test(line)) {
      heading = line.toUpperCase();
      i += 1;
      continue;
    }

    if (TRANSITION_RE.test(line)) {
      blocks.push({
        id: crypto.randomUUID(),
        type: BlockType.TRANSITION,
        text: line.toUpperCase()
      });
      i += 1;
      continue;
    }

    if (isLikelyCharacterCue(line)) {
      const character = line.replace(/\s*\(.*\)\s*$/, '').trim();
      i += 1;

      let parenthetical: string | undefined;
      while (i < lines.length && !normalizeLine(lines[i])) {
        i += 1;
      }
      if (i < lines.length && isParenthetical(lines[i])) {
        parenthetical = normalizeLine(lines[i]).replace(/^\(|\)$/g, '');
        i += 1;
      }

      const dialogueLines: string[] = [];
      while (i < lines.length) {
        const nextLine = normalizeLine(lines[i]);
        if (!nextLine) {
          if (dialogueLines.length > 0) {
            break;
          }
          i += 1;
          continue;
        }
        if (SCENE_HEADING_RE.test(nextLine) || TRANSITION_RE.test(nextLine) || isLikelyCharacterCue(nextLine)) {
          break;
        }
        if (dialogueLines.length > 0 && isLikelyActionAfterDialogue(nextLine, characterPattern)) {
          break;
        }

        dialogueLines.push(nextLine);
        i += 1;
      }

      if (dialogueLines.length > 0) {
        blocks.push({
          id: crypto.randomUUID(),
          type: BlockType.DIALOGUE,
          character: character.toUpperCase(),
          parenthetical,
          text: dialogueLines.join(' ')
        });
      }
      continue;
    }

    const actionLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const nextLine = normalizeLine(lines[i]);
      if (!nextLine) {
        break;
      }
      if (SCENE_HEADING_RE.test(nextLine) || TRANSITION_RE.test(nextLine) || isLikelyCharacterCue(nextLine)) {
        break;
      }
      actionLines.push(nextLine);
      i += 1;
    }

    blocks.push({
      id: crypto.randomUUID(),
      type: BlockType.ACTION,
      text: actionLines.join(' ')
    });
  }

  if (blocks.length === 0 && text) {
    blocks.push({
      id: crypto.randomUUID(),
      type: BlockType.ACTION,
      text
    });
  }

  const summarySource = blocks
    .map((block) => block.text)
    .join(' ')
    .trim();

  return {
    heading,
    summary: makeSummary(summarySource, options.summaryHint || 'Generated continuation'),
    blocks
  };
};
