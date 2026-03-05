import { describe, expect, it, vi } from 'vitest';
import { BlockType, StoryContext } from '../types';
import {
  GenerationOrchestrator,
  captureInsertAnchorSnapshot,
  doesInsertAnchorResolve,
  isRewriteFresh,
  isSetupAutoSurpriseFresh,
  isTitleSuggestionFresh
} from '../services/orchestration';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('LLM orchestration receipt gating', () => {
  it('drops title suggestion when manual title revision changes before resolve', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    const startedPromptContextRevision = 4;
    let currentPromptContextRevision = 4;
    const startedManualTitleRevision = 3;
    let currentManualTitleRevision = 3;

    const run = orchestrator.run<string>({
      opType: 'titleSuggestion',
      scopeKey: 'script:s1:title',
      execute: async () => execution.promise,
      isFresh: () => isTitleSuggestionFresh({
        startedPromptContextRevision,
        currentPromptContextRevision,
        startedManualTitleRevision,
        currentManualTitleRevision
      }),
      commit
    });

    currentManualTitleRevision = 4;
    execution.resolve('New Title');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops generate-next when prompt revision changes in the same tick as resolve', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    const startedPromptContextRevision = 7;
    let currentPromptContextRevision = 7;

    const run = orchestrator.run<string>({
      opType: 'generateNextScene',
      scopeKey: 'script:s1:scene:next',
      execute: async () => execution.promise,
      isFresh: () => currentPromptContextRevision === startedPromptContextRevision,
      commit
    });

    currentPromptContextRevision = 8;
    execution.resolve('Scene content');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops generate-next when a style context mutation bumps prompt revision synchronously', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let promptContextRevision = 11;
    let context: StoryContext | null = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      style: 'Cinematic',
      scenes: []
    };

    const applyContextMutation = (
      mutation: StoryContext | null | ((previous: StoryContext | null) => StoryContext | null)
    ) => {
      const previous = context;
      const next = typeof mutation === 'function'
        ? (mutation as (previous: StoryContext | null) => StoryContext | null)(previous)
        : mutation;
      if (next === previous) {
        return false;
      }
      context = next;
      promptContextRevision += 1;
      return true;
    };

    const startedPromptContextRevision = promptContextRevision;
    const run = orchestrator.run<string>({
      opType: 'generateNextScene',
      scopeKey: 'script:s1:scene:next',
      execute: async () => execution.promise,
      isFresh: () => promptContextRevision === startedPromptContextRevision,
      commit
    });

    const didMutate = applyContextMutation((prev) => (
      prev ? { ...prev, style: 'Dry humor' } : prev
    ));
    expect(didMutate).toBe(true);
    expect(promptContextRevision).toBe(startedPromptContextRevision + 1);

    execution.resolve('Scene content');
    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops rewrite when target block revision changes before resolve', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      scenes: [{
        id: 'scene-1',
        heading: 'INT. OFFICE - NIGHT',
        summary: 'Initial scene',
        blocks: [{
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex studies the evidence.',
          blockRevision: 1
        }]
      }]
    };

    const run = orchestrator.run<string>({
      opType: 'rewriteBlock',
      scopeKey: 'script:s1:block:block-1:rewrite',
      execute: async () => execution.promise,
      isFresh: () => isRewriteFresh({
        context,
        sceneId: 'scene-1',
        blockId: 'block-1',
        startedBlockRevision: 1,
        startedPromptContextRevision: 10,
        currentPromptContextRevision: 10
      }),
      commit
    });

    context = {
      ...context,
      scenes: [{
        ...context.scenes[0],
        blocks: [{
          ...context.scenes[0].blocks[0],
          blockRevision: 2
        }]
      }]
    };
    execution.resolve('Updated line');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops rewrite when target block is locked before resolve', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      scenes: [{
        id: 'scene-1',
        heading: 'INT. OFFICE - NIGHT',
        summary: 'Initial scene',
        blocks: [{
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex studies the evidence.',
          blockRevision: 1,
          locked: false
        }]
      }]
    };

    const run = orchestrator.run<string>({
      opType: 'rewriteBlock',
      scopeKey: 'script:s1:block:block-1:rewrite',
      execute: async () => execution.promise,
      isFresh: () => isRewriteFresh({
        context,
        sceneId: 'scene-1',
        blockId: 'block-1',
        startedBlockRevision: 1,
        startedPromptContextRevision: 10,
        currentPromptContextRevision: 10
      }),
      commit
    });

    context = {
      ...context,
      scenes: [{
        ...context.scenes[0],
        blocks: [{
          ...context.scenes[0].blocks[0],
          locked: true
        }]
      }]
    };
    execution.resolve('Updated line');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops setup auto-surprise when manual edit revision changes before resolve', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<{ genre: string; premise: string; characters: string[] }>();
    const commit = vi.fn();
    let currentSetupManualEditRevision = 0;

    const run = orchestrator.run({
      opType: 'setupAutoSurprise',
      scopeKey: 'setup:setup-1:auto-surprise',
      execute: async () => execution.promise,
      isFresh: () => isSetupAutoSurpriseFresh({
        startedSetupSessionId: 'setup-1',
        currentSetupSessionId: 'setup-1',
        startedSetupManualEditRevision: 0,
        currentSetupManualEditRevision
      }),
      commit
    });

    currentSetupManualEditRevision = 1;
    execution.resolve({
      genre: 'Noir',
      premise: 'Auto premise',
      characters: ['Lead', 'Shadow']
    });

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('drops insert surprise when anchor no longer resolves', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      scenes: [{
        id: 'scene-1',
        heading: 'INT. OFFICE - NIGHT',
        summary: 'Initial scene',
        blocks: [{
          id: 'block-anchor',
          type: BlockType.ACTION,
          text: 'An anchor line.',
          blockRevision: 1
        }]
      }]
    };

    const snapshot = captureInsertAnchorSnapshot(context, {
      sceneId: 'scene-1',
      blockId: 'block-anchor'
    });

    const run = orchestrator.run<string>({
      opType: 'insertSurpriseText',
      scopeKey: `script:s1:insert:${snapshot.anchorIdOrIndex}`,
      execute: async () => execution.promise,
      isFresh: () => doesInsertAnchorResolve(snapshot, context),
      commit
    });

    context = {
      ...context,
      scenes: [{
        ...context.scenes[0],
        blocks: []
      }]
    };
    execution.resolve('Surprise text');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps block-anchor insert freshness when unrelated blocks are added', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      scenes: [{
        id: 'scene-1',
        heading: 'INT. OFFICE - NIGHT',
        summary: 'Initial scene',
        blocks: [{
          id: 'block-anchor',
          type: BlockType.ACTION,
          text: 'An anchor line.',
          blockRevision: 1
        }]
      }]
    };

    const snapshot = captureInsertAnchorSnapshot(context, {
      sceneId: 'scene-1',
      blockId: 'block-anchor'
    });

    const run = orchestrator.run<string>({
      opType: 'insertSurpriseText',
      scopeKey: `script:s1:insert:${snapshot.anchorIdOrIndex}`,
      execute: async () => execution.promise,
      isFresh: () => doesInsertAnchorResolve(snapshot, context),
      commit
    });

    context = {
      ...context,
      scenes: [{
        ...context.scenes[0],
        blocks: [
          {
            id: 'block-new',
            type: BlockType.ACTION,
            text: 'A new line appears above the anchor.',
            blockRevision: 1
          },
          ...context.scenes[0].blocks
        ]
      }]
    };
    execution.resolve('Surprise text');

    const outcome = await run;
    expect(outcome.kind).toBe('committed');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('drops index-based insert freshness when block count changes', async () => {
    const orchestrator = new GenerationOrchestrator();
    const execution = deferred<string>();
    const commit = vi.fn();
    let context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A tense conspiracy.',
      characters: ['Alex'],
      scenes: [{
        id: 'scene-1',
        heading: 'INT. OFFICE - NIGHT',
        summary: 'Initial scene',
        blocks: [{
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'An opening line.',
          blockRevision: 1
        }]
      }]
    };

    const snapshot = captureInsertAnchorSnapshot(context, null);
    expect(snapshot.kind).toBe('index');

    const run = orchestrator.run<string>({
      opType: 'insertSurpriseText',
      scopeKey: `script:s1:insert:${snapshot.anchorIdOrIndex}`,
      execute: async () => execution.promise,
      isFresh: () => doesInsertAnchorResolve(snapshot, context),
      commit
    });

    context = {
      ...context,
      scenes: [{
        ...context.scenes[0],
        blocks: [
          ...context.scenes[0].blocks,
          {
            id: 'block-2',
            type: BlockType.ACTION,
            text: 'A second line shifts the insertion index.',
            blockRevision: 1
          }
        ]
      }]
    };
    execution.resolve('Surprise text');

    const outcome = await run;
    expect(outcome.kind).toBe('dropped');
    expect(commit).not.toHaveBeenCalled();
  });
});
