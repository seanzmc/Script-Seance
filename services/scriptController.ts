import { createBlock, sanitizeGeneratedText, updateBlock as applyBlockPatch } from '../domain/blocks';
import { executeGenerateScene, executeGenerateScriptElement, executeRewriteBlock } from './ai';
import { GenerationOrchestrator, isRewriteFresh, scopeKeys } from './orchestration';
import {
  BlockType,
  INSERT_BOTTOM_ID,
  INSERT_TOP_ID,
  Scene,
  SceneMeta,
  ScriptAnchor,
  ScriptBlock,
  StoryContext
} from '../types';

export interface ScriptBlockTarget {
  sceneId: string;
  blockId: string;
}

export interface ScriptBlockPatch {
  text?: string;
  character?: string;
  parenthetical?: string;
  locked?: boolean;
}

export interface ScriptController {
  script: Scene[];
  selectedBlockId?: string;
  selectedBlockTarget: ScriptBlockTarget | null;
  activeInsertAnchor?: ScriptAnchor;
  activeRewriteBlockId?: string;

  insertBlock: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  rewriteBlock: (blockId: string, prompt: string) => Promise<void>;
  updateBlock: (blockId: string, patch: ScriptBlockPatch) => void;
  generateNextScene: (anchor?: ScriptAnchor) => Promise<void>;
  openInsert: (anchor: ScriptAnchor) => void;
  openRewrite: (target: ScriptBlockTarget) => void;
  closeComposer: () => void;
}

export interface ScriptControllerToast {
  message: string;
  onUndo?: () => void;
}

export type InsertableBlockRef = {
  sceneId: string;
  block: ScriptBlock;
};

export type ScriptMutationAction =
  | { type: 'block'; sceneId: string; block: ScriptBlock; index: number }
  | { type: 'scene'; scene: Scene; index: number }
  | { type: 'scene-heading'; sceneId: string; previousHeading: string; nextHeading: string };

type UndoAction = ScriptMutationAction;

export type StoryContextMutation = StoryContext | null | ((previous: StoryContext | null) => StoryContext | null);

export type NumberStateSetter = (value: number | ((previous: number) => number)) => void;

export type RefValue<T> = {
  current: T;
};

const getErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  return typeof record.message === 'string' ? record.message : undefined;
};

const collapsePromptWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncatePromptText = (value: string, maxChars: number) => {
  const compact = collapsePromptWhitespace(value);
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).trim()}...`;
};

const serializeBlockForInsertPrompt = (block: ScriptBlock) => {
  const label = block.type.toUpperCase();
  if (block.type === BlockType.DIALOGUE) {
    const character = block.character?.trim() || 'UNKNOWN';
    const parenthetical = block.parenthetical?.trim() ? ` (${block.parenthetical.trim()})` : '';
    return `${label} ${character}${parenthetical}: ${truncatePromptText(block.text, 240)}`;
  }
  return `${label}: ${truncatePromptText(block.text, 240)}`;
};

const isPlaceholderScene = (scene: Scene | null | undefined) => Boolean(scene?.meta?.placeholder);

const clearPlaceholderMeta = (scene: Scene, source: SceneMeta['source'] = scene.meta?.source ?? 'user'): Scene => {
  if (!isPlaceholderScene(scene)) return scene;
  return {
    ...scene,
    meta: {
      ...(scene.meta ?? {}),
      source,
      placeholder: false
    }
  };
};

export const collectInsertableBlocks = (storyContext: StoryContext): InsertableBlockRef[] => (
  storyContext.scenes.flatMap((scene) => (
    scene.blocks.map((block) => ({ sceneId: scene.id, block }))
  ))
);

export const findInsertableBlockById = (
  storyContext: StoryContext,
  sceneId: string,
  blockId: string
): { block: ScriptBlock; index: number; ordered: InsertableBlockRef[] } | null => {
  const ordered = collectInsertableBlocks(storyContext);
  const index = ordered.findIndex((entry) => entry.sceneId === sceneId && entry.block.id === blockId);
  if (index < 0) return null;
  return { block: ordered[index].block, index, ordered };
};

export const resolveInsertTargetFromIndex = (
  storyContext: StoryContext,
  insertIndex: number
): ScriptBlockTarget | null => {
  if (storyContext.scenes.length === 0) return null;
  const orderedBlocks = collectInsertableBlocks(storyContext);
  if (insertIndex < 0 || insertIndex > orderedBlocks.length) return null;
  if (insertIndex === 0) {
    return { sceneId: storyContext.scenes[0].id, blockId: INSERT_TOP_ID };
  }
  if (insertIndex === orderedBlocks.length) {
    const lastScene = storyContext.scenes[storyContext.scenes.length - 1];
    return { sceneId: lastScene.id, blockId: INSERT_BOTTOM_ID };
  }
  const before = orderedBlocks[insertIndex - 1];
  return before ? { sceneId: before.sceneId, blockId: before.block.id } : null;
};

export const resolveInsertIndexFromAnchor = (
  storyContext: StoryContext,
  anchor: ScriptAnchor
): number | null => {
  const orderedBlocks = collectInsertableBlocks(storyContext);
  if (anchor.kind === 'index') {
    return anchor.index >= 0 && anchor.index <= orderedBlocks.length ? anchor.index : null;
  }

  if (anchor.kind === 'block') {
    const blockIndex = orderedBlocks.findIndex((entry) => entry.block.id === anchor.blockId);
    if (blockIndex < 0) return null;
    return anchor.position === 'before' ? blockIndex : blockIndex + 1;
  }

  const sceneIndex = storyContext.scenes.findIndex((scene) => scene.id === anchor.sceneId);
  if (sceneIndex < 0) return null;
  const sceneOffset = storyContext.scenes
    .slice(0, sceneIndex)
    .reduce((count, scene) => count + scene.blocks.length, 0);
  const targetScene = storyContext.scenes[sceneIndex];
  return anchor.position === 'top'
    ? sceneOffset
    : sceneOffset + targetScene.blocks.length;
};

export const resolveInsertTargetFromAnchor = (
  storyContext: StoryContext,
  anchor: ScriptAnchor
): ScriptBlockTarget | null => {
  if (anchor.kind === 'index') {
    return resolveInsertTargetFromIndex(storyContext, anchor.index);
  }

  if (anchor.kind === 'scene') {
    const sceneExists = storyContext.scenes.some((scene) => scene.id === anchor.sceneId);
    if (!sceneExists) return null;
    return {
      sceneId: anchor.sceneId,
      blockId: anchor.position === 'top' ? INSERT_TOP_ID : INSERT_BOTTOM_ID
    };
  }

  for (const scene of storyContext.scenes) {
    const blockIndex = scene.blocks.findIndex((block) => block.id === anchor.blockId);
    if (blockIndex < 0) continue;
    if (anchor.position === 'after') {
      return { sceneId: scene.id, blockId: anchor.blockId };
    }
    if (blockIndex === 0) {
      return { sceneId: scene.id, blockId: INSERT_TOP_ID };
    }
    return { sceneId: scene.id, blockId: scene.blocks[blockIndex - 1].id };
  }
  return null;
};

export const sanitizeGeneratedInsertText = (
  type: BlockType,
  rawText: string,
  character?: string
) => sanitizeGeneratedText(type, rawText, character);

export const buildRewritePreviewGuidance = (params: {
  block: ScriptBlock;
  instructions: string;
  previousBlock: ScriptBlock | null;
  nextBlock: ScriptBlock | null;
}) => {
  const trimmedInstructions = params.instructions.trim();
  return [
    'Rewrite this block and return exactly one block of the same screenplay type.',
    params.block.type === BlockType.DIALOGUE && params.block.character
      ? `The speaker MUST remain "${params.block.character}".`
      : '',
    params.block.type === BlockType.DIALOGUE
      ? 'Do not include speaker labels or parentheticals.'
      : '',
    'Return ONLY block content text. Do NOT include type labels like "Action:", "Dialogue:", "Transition:", or "Scene Heading:".',
    trimmedInstructions ? `User rewrite instructions: ${truncatePromptText(trimmedInstructions, 360)}` : '',
    params.previousBlock ? `Previous block: ${serializeBlockForInsertPrompt(params.previousBlock)}` : 'Previous block: Start of script.',
    params.nextBlock ? `Next block: ${serializeBlockForInsertPrompt(params.nextBlock)}` : 'Next block: End of script.'
  ].filter(Boolean).join('\n');
};

export interface ScriptMutationController {
  resolveInsertTargetFromIndex: (context: StoryContext, insertIndex: number) => ScriptBlockTarget | null;
  resolveAnchor: (context: StoryContext, anchor: ScriptAnchor) => ScriptBlockTarget | null;
  applySnapshot: (params: {
    context: StoryContext;
    action: ScriptMutationAction;
    mode: 'undo' | 'redo';
  }) => { nextContext: StoryContext; applied: boolean };
  addBlock: (block: ScriptBlock) => void;
  insertBlock: (target: ScriptBlockTarget, block: ScriptBlock) => void;
  insertBlockAtAnchor: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  insertBlockAtIndex: (insertIndex: number, block: ScriptBlock) => void;
  generateInsertAtAnchor: (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => Promise<void>;
  generateInsertAtIndex: (params: {
    insertIndex: number;
    type: BlockType;
    content: string;
    character?: string;
  }) => Promise<void>;
  generateRewritePreview: (params: {
    sceneId: string;
    blockId: string;
    instructions: string;
  }) => Promise<string>;
  applyRewritePreview: (params: {
    sceneId: string;
    blockId: string;
    text: string;
  }) => void;
  updateBlock: (params: {
    blockId: string;
    patch: ScriptBlockPatch;
    sceneId?: string;
    clearRedo?: boolean;
  }) => boolean;
  updateSceneHeading: (params: {
    sceneId: string;
    heading: string;
    clearRedo?: boolean;
  }) => boolean;
  toggleBlockLock: (sceneId: string, blockId: string) => void;
  changeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  deleteBlock: (sceneId: string, blockId: string) => void;
  generateNextScene: (params: {
    context: StoryContext | null;
    isGenerating: boolean;
    userInstruction: string;
  }) => Promise<void>;
}

export interface CreateScriptMutationControllerDeps {
  applyContextMutation: (mutation: StoryContextMutation, options?: { bumpPromptRevision?: boolean }) => boolean;
  clearRedo: () => void;
  pushUndoAction: (action: UndoAction) => void;
  resolveCharacterName: (value: string, characters: string[]) => string | undefined;
  normalizeSceneCharacters: (scene: Scene, characters: string[]) => Scene;
  handleAiError: (error: unknown, fallbackMessage: string) => void;

  contextRef: RefValue<StoryContext | null>;
  promptContextRevisionRef: RefValue<number>;
  scriptIdRef: RefValue<string>;
  activeGenerationScopeRef: RefValue<string | null>;
  orchestratorRef: RefValue<GenerationOrchestrator>;

  setInsertScrollTargetId: (targetId: string | null) => void;
  setInsertScrollToken: NumberStateSetter;
  setInsertCompleteToken: NumberStateSetter;
  setUserInstruction: (value: string) => void;
  setIsGenerating: (value: boolean) => void;
  setError: (value: string | null) => void;
  setToast: (next: ScriptControllerToast | null) => void;
}

export const createScriptMutationController = (
  deps: CreateScriptMutationControllerDeps
): ScriptMutationController => {
  const applySnapshot = (params: {
    context: StoryContext;
    action: ScriptMutationAction;
    mode: 'undo' | 'redo';
  }) => {
    const { context, action, mode } = params;
    if (mode === 'undo') {
      if (action.type === 'scene-heading') {
        const sceneIndex = context.scenes.findIndex((scene) => scene.id === action.sceneId);
        if (sceneIndex === -1) {
          return { nextContext: context, applied: false };
        }
        const nextScenes = [...context.scenes];
        nextScenes[sceneIndex] = { ...nextScenes[sceneIndex], heading: action.previousHeading };
        return { nextContext: { ...context, scenes: nextScenes }, applied: true };
      }
      if (action.type === 'scene') {
        const sceneIndex = context.scenes.findIndex((scene) => scene.id === action.scene.id);
        if (sceneIndex === -1) {
          return { nextContext: context, applied: false };
        }
        const nextScenes = [...context.scenes];
        nextScenes.splice(sceneIndex, 1);
        return { nextContext: { ...context, scenes: nextScenes }, applied: true };
      }

      const sceneIndex = context.scenes.findIndex((scene) => scene.id === action.sceneId);
      if (sceneIndex === -1) {
        return { nextContext: context, applied: false };
      }
      const scene = context.scenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex((block) => block.id === action.block.id);
      if (blockIndex === -1) {
        return { nextContext: context, applied: false };
      }
      const nextBlocks = [...scene.blocks];
      nextBlocks.splice(blockIndex, 1);
      const nextScenes = [...context.scenes];
      nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
      return { nextContext: { ...context, scenes: nextScenes }, applied: true };
    }

    if (action.type === 'scene-heading') {
      const sceneIndex = context.scenes.findIndex((scene) => scene.id === action.sceneId);
      if (sceneIndex === -1) {
        return { nextContext: context, applied: false };
      }
      const nextScenes = [...context.scenes];
      nextScenes[sceneIndex] = { ...nextScenes[sceneIndex], heading: action.nextHeading };
      return { nextContext: { ...context, scenes: nextScenes }, applied: true };
    }

    if (action.type === 'scene') {
      const existing = context.scenes.some((scene) => scene.id === action.scene.id);
      if (existing) {
        return { nextContext: context, applied: false };
      }
      const nextScenes = [...context.scenes];
      const insertIndex = Math.min(action.index, nextScenes.length);
      nextScenes.splice(insertIndex, 0, action.scene);
      return { nextContext: { ...context, scenes: nextScenes }, applied: true };
    }

    const sceneIndex = context.scenes.findIndex((scene) => scene.id === action.sceneId);
    if (sceneIndex === -1) {
      return { nextContext: context, applied: false };
    }
    const scene = context.scenes[sceneIndex];
    const alreadyExists = scene.blocks.some((block) => block.id === action.block.id);
    if (alreadyExists) {
      return { nextContext: context, applied: false };
    }
    const nextBlocks = [...scene.blocks];
    const insertIndex = Math.min(action.index, nextBlocks.length);
    nextBlocks.splice(insertIndex, 0, action.block);
    const nextScenes = [...context.scenes];
    nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
    return { nextContext: { ...context, scenes: nextScenes }, applied: true };
  };

  const addBlock = (block: ScriptBlock) => {
    if (!deps.contextRef.current) return;
    deps.clearRedo();
    deps.setInsertScrollTargetId(block.id);
    deps.setInsertScrollToken((token) => token + 1);

    deps.applyContextMutation((previous) => {
      if (!previous) return null;
      const normalizedBlock = block.character
        ? { ...block, character: deps.resolveCharacterName(block.character, previous.characters) }
        : block;
      const nextScenes = [...previous.scenes];

      if (normalizedBlock.type === BlockType.HEADING) {
        const nextScene: Scene = {
          id: crypto.randomUUID(),
          heading: normalizedBlock.text.toUpperCase(),
          summary: 'New user created scene',
          blocks: [],
          meta: { source: 'user', placeholder: true }
        };
        nextScenes.push(nextScene);
        deps.pushUndoAction({ type: 'scene', scene: nextScene, index: nextScenes.length - 1 });
        return { ...previous, scenes: nextScenes };
      }

      if (nextScenes.length > 0) {
        const lastSceneIndex = nextScenes.length - 1;
        const updatedScene = {
          ...clearPlaceholderMeta(nextScenes[lastSceneIndex], 'user'),
          blocks: [...nextScenes[lastSceneIndex].blocks, normalizedBlock]
        };
        nextScenes[lastSceneIndex] = updatedScene;
        deps.pushUndoAction({
          type: 'block',
          sceneId: updatedScene.id,
          block: normalizedBlock,
          index: updatedScene.blocks.length - 1
        });
        return { ...previous, scenes: nextScenes };
      }

      const nextScene: Scene = {
        id: crypto.randomUUID(),
        heading: 'EXT. UNKNOWN - DAY',
        summary: 'Start',
        blocks: [normalizedBlock],
        meta: { source: 'user', placeholder: false }
      };
      nextScenes.push(nextScene);
      deps.pushUndoAction({ type: 'scene', scene: nextScene, index: nextScenes.length - 1 });
      return { ...previous, scenes: nextScenes };
    });
  };

  const insertBlock = (
    target: ScriptBlockTarget,
    block: ScriptBlock,
    options?: { clearRedo?: boolean }
  ) => {
    if (options?.clearRedo ?? true) {
      deps.clearRedo();
    }
    deps.applyContextMutation((previous) => {
      if (!previous) return null;
      const sceneIndex = previous.scenes.findIndex((scene) => scene.id === target.sceneId);
      if (sceneIndex === -1) return previous;

      const normalizedBlock = block.character
        ? { ...block, character: deps.resolveCharacterName(block.character, previous.characters) }
        : block;
      const nextScenes = [...previous.scenes];
      if (normalizedBlock.type === BlockType.HEADING) {
        const nextScene: Scene = {
          id: crypto.randomUUID(),
          heading: normalizedBlock.text.toUpperCase(),
          summary: 'New user created scene',
          blocks: [],
          meta: { source: 'user', placeholder: true }
        };
        const insertIndex = target.blockId === INSERT_TOP_ID ? sceneIndex : sceneIndex + 1;
        nextScenes.splice(insertIndex, 0, nextScene);
        deps.pushUndoAction({ type: 'scene', scene: nextScene, index: insertIndex });
        return { ...previous, scenes: nextScenes };
      }

      const scene = nextScenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex((entry) => entry.id === target.blockId);
      const insertIndex = target.blockId === INSERT_TOP_ID
        ? 0
        : blockIndex === -1 || target.blockId === INSERT_BOTTOM_ID
          ? scene.blocks.length
          : blockIndex + 1;
      const updatedBlocks = [...scene.blocks];
      updatedBlocks.splice(insertIndex, 0, normalizedBlock);
      nextScenes[sceneIndex] = { ...clearPlaceholderMeta(scene, 'user'), blocks: updatedBlocks };
      deps.pushUndoAction({ type: 'block', sceneId: scene.id, block: normalizedBlock, index: insertIndex });
      return { ...previous, scenes: nextScenes };
    });
  };

  const resolveAnchor = (context: StoryContext, anchor: ScriptAnchor) => (
    resolveInsertTargetFromAnchor(context, anchor)
  );

  const normalizeBlocksForInsert = (context: StoryContext, blocks: ScriptBlock[]) => (
    blocks.map((block) => (
      block.character
        ? { ...block, character: deps.resolveCharacterName(block.character, context.characters) }
        : block
    ))
  );

  const bumpBlockRevisions = (blocks: ScriptBlock[]) => (
    blocks.map((block) => {
      const nextRevision = Number.isInteger(block.blockRevision)
        ? Math.max(1, block.blockRevision)
        : 1;
      return nextRevision === block.blockRevision
        ? block
        : { ...block, blockRevision: nextRevision };
    })
  );

  const applyGeneratedBlocks = (anchor: ScriptAnchor, blocks: ScriptBlock[]) => {
    const latestContext = deps.contextRef.current;
    if (!latestContext || blocks.length === 0) return [];
    const initialTarget = resolveAnchor(latestContext, anchor);
    if (!initialTarget) return [];

    const normalizedBlocks = normalizeBlocksForInsert(latestContext, blocks);
    const preparedBlocks = bumpBlockRevisions(normalizedBlocks);

    let currentTarget = initialTarget;
    preparedBlocks.forEach((block, index) => {
      insertBlock(currentTarget, block, { clearRedo: index === 0 });
      if (block.type !== BlockType.HEADING) {
        currentTarget = { sceneId: currentTarget.sceneId, blockId: block.id };
      }
    });
    return preparedBlocks;
  };

  const insertBlockAtAnchor = (anchor: ScriptAnchor, block: ScriptBlock) => {
    const insertedBlocks = applyGeneratedBlocks(anchor, [block]);
    const [inserted] = insertedBlocks;
    if (!inserted) return;
    deps.setInsertScrollTargetId(inserted.id);
    deps.setInsertScrollToken((token) => token + 1);
    deps.setInsertCompleteToken((token) => token + 1);
  };

  const insertBlockAtIndex = (insertIndex: number, block: ScriptBlock) => {
    insertBlockAtAnchor(createIndexAnchor(insertIndex), block);
  };

  const updateBlock = (params: {
    blockId: string;
    patch: ScriptBlockPatch;
    sceneId?: string;
    clearRedo?: boolean;
  }) => {
    if (params.clearRedo ?? false) {
      deps.clearRedo();
    }
    let applied = false;
    deps.applyContextMutation((previous) => {
      if (!previous) return null;
      const nextScenes = previous.scenes.map((scene) => {
        if (params.sceneId && scene.id !== params.sceneId) {
          return scene;
        }
        return {
          ...scene,
          blocks: scene.blocks.map((block) => {
            if (block.id !== params.blockId) {
              return block;
            }
            applied = true;
            return applyBlockPatch(block, params.patch);
          })
        };
      });
      return { ...previous, scenes: nextScenes };
    });
    return applied;
  };

  const updateSceneHeading = (params: {
    sceneId: string;
    heading: string;
    clearRedo?: boolean;
  }) => {
    const nextHeading = params.heading.trim().toUpperCase();
    if (!nextHeading) return false;
    if (params.clearRedo ?? false) {
      deps.clearRedo();
    }
    let previousHeading: string | null = null;
    const didMutate = deps.applyContextMutation((previous) => {
      if (!previous) return null;
      const sceneIndex = previous.scenes.findIndex((scene) => scene.id === params.sceneId);
      if (sceneIndex === -1) return previous;
      const scene = previous.scenes[sceneIndex];
      if (scene.heading === nextHeading) return previous;
      previousHeading = scene.heading;
      const nextScenes = [...previous.scenes];
      nextScenes[sceneIndex] = { ...scene, heading: nextHeading };
      return { ...previous, scenes: nextScenes };
    }, { bumpPromptRevision: true });
    if (!didMutate || previousHeading === null) {
      return false;
    }
    deps.pushUndoAction({
      type: 'scene-heading',
      sceneId: params.sceneId,
      previousHeading,
      nextHeading
    });
    return true;
  };

  const toggleBlockLock = (sceneId: string, blockId: string) => {
    deps.clearRedo();
    deps.applyContextMutation((previous) => {
      if (!previous) return null;
      return {
        ...previous,
        scenes: previous.scenes.map((scene) => (
          scene.id !== sceneId
            ? scene
            : {
                ...scene,
                blocks: scene.blocks.map((block) => (
                  block.id === blockId
                    ? { ...block, locked: !block.locked }
                    : block
                ))
              }
        ))
      };
    });
  };

  const changeSpeaker = (sceneId: string, blockId: string, character: string) => {
    deps.clearRedo();
    deps.applyContextMutation((previous) => {
      if (!previous) return null;
      const resolvedCharacter = deps.resolveCharacterName(character, previous.characters);
      return {
        ...previous,
        scenes: previous.scenes.map((scene) => (
          scene.id !== sceneId
            ? scene
            : {
                ...scene,
                blocks: scene.blocks.map((block) => {
                  if (block.id !== blockId) {
                    return block;
                  }
                  if (block.character === resolvedCharacter) {
                    return block;
                  }
                  return applyBlockPatch(block, { character: resolvedCharacter });
                })
              }
        ))
      };
    });
  };

  const deleteBlock = (sceneId: string, blockId: string) => {
    let deletedBlock: ScriptBlock | null = null;
    let deletedIndex = -1;

    deps.clearRedo();
    const didMutate = deps.applyContextMutation((previous) => {
      if (!previous) return previous;
      const sceneIndex = previous.scenes.findIndex((scene) => scene.id === sceneId);
      if (sceneIndex === -1) return previous;

      const scene = previous.scenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex((block) => block.id === blockId);
      if (blockIndex === -1) return previous;

      deletedBlock = scene.blocks[blockIndex];
      deletedIndex = blockIndex;

      const nextBlocks = [...scene.blocks];
      nextBlocks.splice(blockIndex, 1);
      const nextScenes = [...previous.scenes];
      nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
      return { ...previous, scenes: nextScenes };
    });

    if (!didMutate || deletedBlock === null || deletedIndex < 0) {
      return;
    }
    const restoredBlock = deletedBlock;
    const restoredIndex = deletedIndex;

    deps.setToast({
      message: 'Block deleted',
      onUndo: () => {
        deps.clearRedo();
        deps.applyContextMutation((previous) => {
          if (!previous) return previous;
          const sceneIndex = previous.scenes.findIndex((scene) => scene.id === sceneId);
          if (sceneIndex === -1) return previous;

          const scene = previous.scenes[sceneIndex];
          if (scene.blocks.some((block) => block.id === restoredBlock.id)) {
            return previous;
          }

          const nextBlocks = [...scene.blocks];
          const insertIndex = Math.min(restoredIndex, nextBlocks.length);
          nextBlocks.splice(insertIndex, 0, restoredBlock);
          const nextScenes = [...previous.scenes];
          nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
          return { ...previous, scenes: nextScenes };
        });
        deps.setInsertScrollTargetId(restoredBlock.id);
        deps.setInsertScrollToken((token) => token + 1);
        deps.setToast(null);
      }
    });
  };

  const applyRewritePreview = (params: {
    sceneId: string;
    blockId: string;
    text: string;
  }) => {
    const nextText = params.text.trim();
    if (!nextText) return;
    const applied = updateBlock({
      sceneId: params.sceneId,
      blockId: params.blockId,
      patch: { text: nextText },
      clearRedo: true
    });
    if (!applied) return;
    deps.setInsertScrollTargetId(params.blockId);
    deps.setInsertScrollToken((token) => token + 1);
  };

  const generateInsertAtAnchor = async (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => {
    const latestContext = deps.contextRef.current;
    if (!latestContext) {
      throw new Error('Script context unavailable.');
    }

    const initialTarget = resolveAnchor(latestContext, params.anchor);
    if (!initialTarget) {
      throw new Error('Insertion point is no longer available.');
    }
    const insertionIndex = resolveInsertIndexFromAnchor(latestContext, params.anchor);
    if (insertionIndex === null) {
      throw new Error('Insertion point is no longer available.');
    }

    const orderedBlocks = collectInsertableBlocks(latestContext);
    const previousBlock = insertionIndex > 0 ? orderedBlocks[insertionIndex - 1]?.block : null;
    const nextBlock = insertionIndex < orderedBlocks.length ? orderedBlocks[insertionIndex]?.block : null;
    const selectedCharacter = params.type === BlockType.DIALOGUE
      ? deps.resolveCharacterName(params.character ?? latestContext.characters[0] ?? 'Narrator', latestContext.characters)
      : undefined;

    const trimmedDirection = params.content.trim();
    const instructionLines = [
      `Generate exactly one screenplay block of type "${params.type}".`,
      params.type === BlockType.HEADING
        ? 'Return one scene heading slugline only (for example: INT. LOCATION - DAY).'
        : '',
      params.type === BlockType.ACTION
        ? 'Return one concise action line only. Do not include dialogue labels, transitions, or extra blocks.'
        : '',
      params.type === BlockType.DIALOGUE
        ? `Return one dialogue line only. The speaker MUST be "${selectedCharacter}". Do not include speaker labels, parentheticals, or labels like "Dialogue:".`
        : '',
      params.type === BlockType.TRANSITION
        ? 'Return one transition cue only (for example: CUT TO:).'
        : '',
      trimmedDirection
        ? `Direction: ${truncatePromptText(trimmedDirection, 420)}`
        : 'Direction: Choose the most coherent insertion for this exact position.',
      previousBlock
        ? `Previous block: ${serializeBlockForInsertPrompt(previousBlock)}`
        : 'Previous block: Start of script.',
      nextBlock
        ? `Next block: ${serializeBlockForInsertPrompt(nextBlock)}`
        : 'Next block: End of script.',
      'Return ONLY the block content text. Do NOT include the block type label (for example, do not write "Action:", "Dialogue:", "Transition:", or "Scene Heading:").',
      'If you return JSON, return exactly {"content":"..."} and keep content free of any block type label prefix.',
      'Output plain text for that one block only. No lists, no extra formatting, no surrounding explanation.'
    ].filter(Boolean);
    const instruction = instructionLines.join('\n');

    const styleContext = [
      `Genre: ${latestContext.genre}.`,
      `Premise: ${truncatePromptText(latestContext.premise, 520)}`,
      latestContext.characters.length ? `Characters: ${latestContext.characters.join(', ')}.` : ''
    ].filter(Boolean).join('\n');

    const startedPromptContextRevision = deps.promptContextRevisionRef.current;
    const scopeKey = scopeKeys.insertSurpriseText(deps.scriptIdRef.current, params.anchor.id);

    const outcome = await deps.orchestratorRef.current.run<string>({
      opType: 'insertSurpriseText',
      scopeKey,
      execute: (signal) => executeGenerateScriptElement(
        params.type,
        selectedCharacter ?? undefined,
        instruction,
        styleContext,
        {
          styleId: latestContext.styleId,
          styleName: latestContext.style,
          style: latestContext.style
        },
        { signal, opType: 'insertSurpriseText', scopeKey }
      ),
      isFresh: () => {
        const currentContext = deps.contextRef.current;
        if (!currentContext) return false;
        if (deps.promptContextRevisionRef.current !== startedPromptContextRevision) return false;
        return Boolean(resolveAnchor(currentContext, params.anchor));
      },
      commit: (generatedText) => {
        const text = sanitizeGeneratedInsertText(params.type, generatedText, selectedCharacter ?? undefined);
        if (!text) {
          throw new Error('AI returned empty content for insert.');
        }
        const generatedBlock = createBlock({
          type: params.type,
          text,
          character: params.type === BlockType.DIALOGUE ? selectedCharacter : undefined
        });
        const [inserted] = applyGeneratedBlocks(params.anchor, [generatedBlock]);
        if (!inserted) {
          throw new Error('Insertion point is no longer available.');
        }
        deps.setInsertScrollTargetId(inserted.id);
        deps.setInsertScrollToken((token) => token + 1);
        deps.setInsertCompleteToken((token) => token + 1);
      }
    });

    if (outcome.kind === 'failed') {
      throw new Error(getErrorMessage(outcome.error) || 'Failed to generate insert block.');
    }
    if (outcome.kind !== 'committed') {
      throw new Error('Insert generation was interrupted.');
    }
  };

  const generateInsertAtIndex = async (params: {
    insertIndex: number;
    type: BlockType;
    content: string;
    character?: string;
  }) => generateInsertAtAnchor({
    ...params,
    anchor: createIndexAnchor(params.insertIndex)
  });

  const generateRewritePreview = async (params: {
    sceneId: string;
    blockId: string;
    instructions: string;
  }) => {
    const latestContext = deps.contextRef.current;
    if (!latestContext) {
      throw new Error('Script context unavailable.');
    }

    const targetInfo = findInsertableBlockById(latestContext, params.sceneId, params.blockId);
    if (!targetInfo) {
      throw new Error('Selected block is no longer available.');
    }

    const targetBlock = targetInfo.block;
    if (targetBlock.locked) {
      throw new Error('Locked blocks cannot be rewritten.');
    }

    const previousBlock = targetInfo.index > 0 ? targetInfo.ordered[targetInfo.index - 1]?.block : null;
    const nextBlock = targetInfo.index < targetInfo.ordered.length - 1
      ? targetInfo.ordered[targetInfo.index + 1]?.block
      : null;

    const rewriteGuidance = buildRewritePreviewGuidance({
      block: targetBlock,
      instructions: params.instructions,
      previousBlock: previousBlock ?? null,
      nextBlock: nextBlock ?? null
    });

    const startedBlockRevision = targetBlock.blockRevision;
    const startedPromptContextRevision = deps.promptContextRevisionRef.current;
    const scopeKey = scopeKeys.rewriteBlock(deps.scriptIdRef.current, params.blockId);
    let previewText = '';

    const outcome = await deps.orchestratorRef.current.run<string>({
      opType: 'rewriteBlock',
      scopeKey,
      execute: (signal) => executeRewriteBlock(
        targetBlock,
        latestContext.genre,
        latestContext.premise,
        {
          styleId: latestContext.styleId,
          styleName: latestContext.style,
          style: latestContext.style
        },
        rewriteGuidance,
        { signal, opType: 'rewriteBlock', scopeKey }
      ),
      isFresh: () => isRewriteFresh({
        context: deps.contextRef.current,
        sceneId: params.sceneId,
        blockId: params.blockId,
        startedBlockRevision,
        startedPromptContextRevision,
        currentPromptContextRevision: deps.promptContextRevisionRef.current
      }),
      commit: (generatedText) => {
        const sanitized = sanitizeGeneratedInsertText(
          targetBlock.type,
          generatedText,
          targetBlock.character ?? undefined
        );
        if (!sanitized) {
          throw new Error('AI returned empty rewrite content.');
        }
        previewText = sanitized;
      }
    });

    if (outcome.kind === 'failed') {
      throw new Error(getErrorMessage(outcome.error) || 'Failed to generate rewrite preview.');
    }
    if (outcome.kind !== 'committed') {
      throw new Error('Rewrite generation was interrupted.');
    }

    return previewText;
  };

  const generateNextScene = async (params: {
    context: StoryContext | null;
    isGenerating: boolean;
    userInstruction: string;
  }) => {
    if (!params.context || params.isGenerating) return;
    try {
      deps.clearRedo();
      const prompt = params.userInstruction || 'Continue the story logically.';
      const startedPromptContextRevision = deps.promptContextRevisionRef.current;
      const scopeKey = scopeKeys.generateNextScene(deps.scriptIdRef.current);
      deps.activeGenerationScopeRef.current = scopeKey;
      deps.setIsGenerating(true);
      deps.setError(null);

      const outcome = await deps.orchestratorRef.current.run<Scene>({
        opType: 'generateNextScene',
        scopeKey,
        execute: (signal) => executeGenerateScene(
          params.context,
          prompt,
          false,
          { signal, opType: 'generateNextScene', scopeKey }
        ),
        isFresh: () => deps.promptContextRevisionRef.current === startedPromptContextRevision,
        commit: (nextScene) => {
          const normalizedScene = {
            ...deps.normalizeSceneCharacters(nextScene, params.context?.characters ?? []),
            meta: { source: 'ai' as const, placeholder: false }
          };
          const lastBlockId = normalizedScene.blocks[normalizedScene.blocks.length - 1]?.id;
          deps.applyContextMutation((previous) => {
            if (!previous) return null;
            const lastScene = previous.scenes[previous.scenes.length - 1];
            if (lastScene && isPlaceholderScene(lastScene)) {
              const nextScenes = [...previous.scenes];
              nextScenes[nextScenes.length - 1] = {
                ...lastScene,
                summary: normalizedScene.summary,
                blocks: normalizedScene.blocks,
                meta: { ...(lastScene.meta ?? {}), source: 'user' as const, placeholder: false }
              };
              return {
                ...previous,
                scenes: nextScenes
              };
            }
            return {
              ...previous,
              scenes: [...previous.scenes, normalizedScene]
            };
          });
          deps.setInsertScrollTargetId(lastBlockId ?? 'bottom');
          deps.setInsertScrollToken((token) => token + 1);
          deps.setUserInstruction('');
        }
      });

      if (outcome.kind === 'failed') {
        deps.handleAiError(outcome.error, 'Failed to generate scene.');
      }
    } catch (error) {
      deps.handleAiError(error, 'Failed to generate scene.');
    } finally {
      if (deps.activeGenerationScopeRef.current === scopeKeys.generateNextScene(deps.scriptIdRef.current)) {
        deps.activeGenerationScopeRef.current = null;
      }
      deps.setIsGenerating(false);
    }
  };

  return {
    resolveInsertTargetFromIndex,
    resolveAnchor,
    applySnapshot,
    addBlock,
    insertBlock,
    insertBlockAtAnchor,
    insertBlockAtIndex,
    generateInsertAtAnchor,
    generateInsertAtIndex,
    generateRewritePreview,
    applyRewritePreview,
    updateBlock,
    updateSceneHeading,
    toggleBlockLock,
    changeSpeaker,
    deleteBlock,
    generateNextScene
  };
};

export const createIndexAnchor = (index: number): ScriptAnchor => ({
  kind: 'index',
  index,
  id: `index:${index}`
});

export const createBeforeBlockAnchor = (blockId: string): ScriptAnchor => ({
  kind: 'block',
  blockId,
  position: 'before',
  id: `block:${blockId}:before`
});

export const createAfterBlockAnchor = (blockId: string): ScriptAnchor => ({
  kind: 'block',
  blockId,
  position: 'after',
  id: `block:${blockId}:after`
});

export const createSceneTopAnchor = (sceneId: string): ScriptAnchor => ({
  kind: 'scene',
  sceneId,
  position: 'top',
  id: `scene:${sceneId}:top`
});

export const createSceneBottomAnchor = (sceneId: string): ScriptAnchor => ({
  kind: 'scene',
  sceneId,
  position: 'bottom',
  id: `scene:${sceneId}:bottom`
});
