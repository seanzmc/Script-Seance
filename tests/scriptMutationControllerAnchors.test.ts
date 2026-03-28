import { describe, expect, it, vi } from 'vitest';
import { BlockType, INSERT_TOP_ID, ScriptBlock, StoryContext } from '../types';
import {
  createAfterBlockAnchor,
  createBeforeBlockAnchor,
  createIndexAnchor,
  createScriptMutationController
} from '../services/scriptController';
import { GenerationOrchestrator } from '../services/orchestration';

const buildBlock = (id: string, text: string): ScriptBlock => ({
  id,
  type: BlockType.ACTION,
  text,
  blockRevision: 1
});

const buildContext = (): StoryContext => ({
  title: 'Draft',
  genre: 'Noir',
  premise: 'A clue changes everything.',
  characters: ['Alex'],
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. ARCHIVE - NIGHT',
      summary: 'Discovery',
      blocks: [
        buildBlock('block-1', 'Alex opens the archive drawer.'),
        buildBlock('block-2', 'A ledger falls onto the desk.')
      ]
    },
    {
      id: 'scene-2',
      heading: 'EXT. ALLEY - NIGHT',
      summary: 'Pursuit',
      blocks: [
        buildBlock('block-3', 'A shadow moves near the alley exit.')
      ]
    }
  ]
});

const createControllerHarness = (context = buildContext()) => {
  const contextRef = { current: context as StoryContext | null };
  const pushUndoAction = vi.fn();

  const controller = createScriptMutationController({
    applyContextMutation: (mutation) => {
      const previous = contextRef.current;
      const next = typeof mutation === 'function'
        ? mutation(previous)
        : mutation;
      if (next === previous) {
        return false;
      }
      contextRef.current = next;
      return true;
    },
    clearRedo: vi.fn(),
    pushUndoAction,
    resolveCharacterName: (value) => value,
    normalizeSceneCharacters: (scene) => scene,
    handleAiError: vi.fn(),
    contextRef,
    promptContextRevisionRef: { current: 0 },
    scriptIdRef: { current: 'script-1' },
    activeGenerationScopeRef: { current: null },
    orchestratorRef: { current: new GenerationOrchestrator() },
    setRevealScrollTargetId: vi.fn(),
    setRevealScrollMode: vi.fn(),
    setRevealScrollToken: vi.fn(),
    setInsertCompleteToken: vi.fn(),
    setUserInstruction: vi.fn(),
    setIsGenerating: vi.fn(),
    setError: vi.fn(),
    setToast: vi.fn()
  });

  return {
    controller,
    contextRef,
    pushUndoAction
  };
};

describe('script mutation controller anchors', () => {
  it('resolves block and legacy index anchors to insertion targets', () => {
    const { controller, contextRef } = createControllerHarness();
    const context = contextRef.current as StoryContext;

    expect(controller.resolveAnchor(context, createAfterBlockAnchor('block-2'))).toEqual({
      sceneId: 'scene-1',
      blockId: 'block-2'
    });
    expect(controller.resolveAnchor(context, createBeforeBlockAnchor('block-1'))).toEqual({
      sceneId: 'scene-1',
      blockId: INSERT_TOP_ID
    });
    expect(controller.resolveAnchor(context, createIndexAnchor(2))).toEqual({
      sceneId: 'scene-1',
      blockId: 'block-2'
    });
  });

  it('inserts at anchored location using block identity', () => {
    const { controller, contextRef } = createControllerHarness();
    controller.insertBlockAtAnchor(createAfterBlockAnchor('block-1'), buildBlock('block-new', 'A fresh beat.'));

    const sceneOneBlocks = (contextRef.current as StoryContext).scenes[0].blocks.map((block) => block.id);
    expect(sceneOneBlocks).toEqual(['block-1', 'block-new', 'block-2']);
  });

  it('keeps index-based insertion compatibility through controller wrappers', () => {
    const { controller, contextRef } = createControllerHarness();
    controller.insertBlockAtIndex(2, buildBlock('block-legacy', 'Legacy index insert.'));

    const sceneOneBlocks = (contextRef.current as StoryContext).scenes[0].blocks.map((block) => block.id);
    expect(sceneOneBlocks).toEqual(['block-1', 'block-2', 'block-legacy']);
  });

  it('records block deletion as a normal undoable history action', () => {
    const { controller, contextRef, pushUndoAction } = createControllerHarness();
    controller.deleteBlock('scene-1', 'block-2');

    const currentContext = contextRef.current as StoryContext;
    expect(currentContext.scenes[0].blocks.map((block) => block.id)).toEqual(['block-1']);

    const deleteAction = pushUndoAction.mock.calls[0]?.[0];
    expect(deleteAction).toMatchObject({
      type: 'block-delete',
      sceneId: 'scene-1',
      index: 1,
      block: expect.objectContaining({ id: 'block-2' })
    });

    const undoResult = controller.applySnapshot({
      context: currentContext,
      action: deleteAction,
      mode: 'undo'
    });
    expect(undoResult.applied).toBe(true);
    expect(undoResult.nextContext.scenes[0].blocks.map((block) => block.id)).toEqual(['block-1', 'block-2']);

    const redoResult = controller.applySnapshot({
      context: undoResult.nextContext,
      action: deleteAction,
      mode: 'redo'
    });
    expect(redoResult.applied).toBe(true);
    expect(redoResult.nextContext.scenes[0].blocks.map((block) => block.id)).toEqual(['block-1']);
  });
});
