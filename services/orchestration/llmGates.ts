import { INSERT_BOTTOM_ID, INSERT_TOP_ID, StoryContext } from '../../types';

export const isTitleSuggestionFresh = (params: {
  startedPromptContextRevision: number;
  currentPromptContextRevision: number;
  startedManualTitleRevision: number;
  currentManualTitleRevision: number;
}) => (
  params.startedPromptContextRevision === params.currentPromptContextRevision &&
  params.startedManualTitleRevision === params.currentManualTitleRevision
);

export const isRewriteFresh = (params: {
  context: StoryContext | null;
  sceneId: string;
  blockId: string;
  startedBlockRevision: number;
  startedPromptContextRevision: number;
  currentPromptContextRevision: number;
}) => {
  if (params.startedPromptContextRevision !== params.currentPromptContextRevision) {
    return false;
  }
  const scene = params.context?.scenes.find((candidate) => candidate.id === params.sceneId);
  const block = scene?.blocks.find((candidate) => candidate.id === params.blockId);
  if (!block) {
    return false;
  }
  return block.blockRevision === params.startedBlockRevision;
};

export const isSetupAutoSurpriseFresh = (params: {
  startedSetupSessionId: string;
  currentSetupSessionId: string;
  startedSetupManualEditRevision: number;
  currentSetupManualEditRevision: number;
}) => (
  params.startedSetupSessionId === params.currentSetupSessionId &&
  params.startedSetupManualEditRevision === params.currentSetupManualEditRevision
);

export type InsertAnchorSnapshot =
  | { kind: 'block'; anchorIdOrIndex: string; sceneId: string; blockId: string }
  | { kind: 'scene-top'; anchorIdOrIndex: string; sceneId: string }
  | { kind: 'scene-bottom'; anchorIdOrIndex: string; sceneId: string }
  | { kind: 'index'; anchorIdOrIndex: number; insertionIndex: number }
  | { kind: 'empty'; anchorIdOrIndex: number };

export const captureInsertAnchorSnapshot = (
  context: StoryContext | null,
  insertTarget: { sceneId: string; blockId: string } | null
): InsertAnchorSnapshot => {
  if (insertTarget) {
    if (insertTarget.blockId === INSERT_TOP_ID) {
      return {
        kind: 'scene-top',
        anchorIdOrIndex: `${insertTarget.sceneId}:${INSERT_TOP_ID}`,
        sceneId: insertTarget.sceneId
      };
    }
    if (insertTarget.blockId === INSERT_BOTTOM_ID) {
      return {
        kind: 'scene-bottom',
        anchorIdOrIndex: `${insertTarget.sceneId}:${INSERT_BOTTOM_ID}`,
        sceneId: insertTarget.sceneId
      };
    }
    return {
      kind: 'block',
      anchorIdOrIndex: insertTarget.blockId,
      sceneId: insertTarget.sceneId,
      blockId: insertTarget.blockId
    };
  }

  if (!context || context.scenes.length === 0) {
    return {
      kind: 'empty',
      anchorIdOrIndex: 0
    };
  }

  const insertionIndex = context.scenes.reduce((count, scene) => count + scene.blocks.length, 0);
  return {
    kind: 'index',
    anchorIdOrIndex: insertionIndex,
    insertionIndex
  };
};

export const doesInsertAnchorResolve = (
  snapshot: InsertAnchorSnapshot,
  context: StoryContext | null
) => {
  if (snapshot.kind === 'empty') {
    const blockCount = context
      ? context.scenes.reduce((count, scene) => count + scene.blocks.length, 0)
      : 0;
    return blockCount === 0;
  }

  if (snapshot.kind === 'index') {
    if (!context) return false;
    const blockCount = context.scenes.reduce((count, scene) => count + scene.blocks.length, 0);
    return blockCount === snapshot.insertionIndex;
  }

  if (!context) return false;
  const scene = context.scenes.find((candidate) => candidate.id === snapshot.sceneId);
  if (!scene) return false;

  if (snapshot.kind === 'scene-top' || snapshot.kind === 'scene-bottom') {
    return true;
  }

  return scene.blocks.some((block) => block.id === snapshot.blockId);
};
