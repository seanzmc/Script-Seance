import { describe, expect, it, vi } from 'vitest';
import { GenerationOrchestrator } from '../services/orchestration/generationOrchestrator';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('GenerationOrchestrator', () => {
  it('latest op aborts prior op in the same scope', async () => {
    const orchestrator = new GenerationOrchestrator();
    const firstExecution = deferred<string>();
    const firstCommit = vi.fn();
    let firstSignal: AbortSignal | null = null;

    const firstRun = orchestrator.run({
      opType: 'generateNextScene',
      scopeKey: 'script:s1:scene:next',
      execute: async (signal) => {
        firstSignal = signal;
        return firstExecution.promise;
      },
      isFresh: () => true,
      commit: firstCommit
    });

    await Promise.resolve();
    expect(firstSignal?.aborted).toBe(false);

    const secondCommit = vi.fn();
    const secondRun = orchestrator.run({
      opType: 'generateNextScene',
      scopeKey: 'script:s1:scene:next',
      execute: async () => 'scene-2',
      isFresh: () => true,
      commit: secondCommit
    });

    expect(firstSignal?.aborted).toBe(true);
    const secondOutcome = await secondRun;
    expect(secondOutcome.kind).toBe('committed');
    expect(secondCommit).toHaveBeenCalledTimes(1);

    firstExecution.resolve('scene-1');
    const firstOutcome = await firstRun;
    expect(firstOutcome.kind).toBe('aborted');
    expect(firstCommit).not.toHaveBeenCalled();
  });

  it('different scopes do not interfere', async () => {
    const orchestrator = new GenerationOrchestrator();
    const commitA = vi.fn();
    const commitB = vi.fn();
    let signalA: AbortSignal | null = null;
    let signalB: AbortSignal | null = null;

    const runA = orchestrator.run({
      opType: 'generateNextScene',
      scopeKey: 'script:s1:scene:next',
      execute: async (signal) => {
        signalA = signal;
        return 'a';
      },
      isFresh: () => true,
      commit: commitA
    });

    const runB = orchestrator.run({
      opType: 'suggestPlotTwist',
      scopeKey: 'script:s1:twist',
      execute: async (signal) => {
        signalB = signal;
        return 'b';
      },
      isFresh: () => true,
      commit: commitB
    });

    const [outcomeA, outcomeB] = await Promise.all([runA, runB]);
    expect(outcomeA.kind).toBe('committed');
    expect(outcomeB.kind).toBe('committed');
    expect(signalA?.aborted).toBe(false);
    expect(signalB?.aborted).toBe(false);
    expect(commitA).toHaveBeenCalledTimes(1);
    expect(commitB).toHaveBeenCalledTimes(1);
  });

  it('stale gate drops result and skips commit', async () => {
    const orchestrator = new GenerationOrchestrator();
    const commit = vi.fn();

    const outcome = await orchestrator.run({
      opType: 'rewriteBlock',
      scopeKey: 'script:s1:block:b1:rewrite',
      execute: async () => 'rewritten',
      isFresh: () => false,
      commit
    });

    expect(outcome.kind).toBe('dropped');
    if (outcome.kind === 'dropped') {
      expect(outcome.reason).toBe('stale');
    }
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancelled abort returns aborted outcome, not failed', async () => {
    const orchestrator = new GenerationOrchestrator();
    const commit = vi.fn();

    const run = orchestrator.run({
      opType: 'setupSurprise',
      scopeKey: 'setup:abc:surprise',
      execute: async (signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
      isFresh: () => true,
      commit
    });

    const cancelled = orchestrator.cancelScope('setup:abc:surprise');
    expect(cancelled).toBe(true);

    const outcome = await run;
    expect(outcome.kind).toBe('aborted');
    expect(commit).not.toHaveBeenCalled();
  });

  it('ttsPreview latest-wins within preview scope', async () => {
    const orchestrator = new GenerationOrchestrator();
    const firstExecution = deferred<ArrayBuffer>();
    let firstSignal: AbortSignal | null = null;
    const firstCommit = vi.fn();

    const firstRun = orchestrator.run({
      opType: 'ttsPreview',
      scopeKey: 'script:s1:tts:preview:voice-1',
      execute: async (signal) => {
        firstSignal = signal;
        return firstExecution.promise;
      },
      isFresh: () => true,
      commit: firstCommit
    });

    await Promise.resolve();

    const secondCommit = vi.fn();
    const secondRun = orchestrator.run({
      opType: 'ttsPreview',
      scopeKey: 'script:s1:tts:preview:voice-1',
      execute: async () => new ArrayBuffer(8),
      isFresh: () => true,
      commit: secondCommit
    });

    expect(firstSignal?.aborted).toBe(true);
    const secondOutcome = await secondRun;
    expect(secondOutcome.kind).toBe('committed');
    expect(secondCommit).toHaveBeenCalledTimes(1);

    firstExecution.resolve(new ArrayBuffer(8));
    const firstOutcome = await firstRun;
    expect(firstOutcome.kind).toBe('aborted');
    expect(firstCommit).not.toHaveBeenCalled();
  });
});
