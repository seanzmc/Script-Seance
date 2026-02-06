import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptEngine } from '../services/scriptEngine';
import { BlockType, ScriptBlock, VoiceConfig } from '../types';

type PendingRequest = {
  promise: Promise<ArrayBuffer>;
  resolve: (buffer: ArrayBuffer) => void;
  reject: (error: unknown) => void;
  cancel: ReturnType<typeof vi.fn>;
};

const { pendingRequests, createGenerateSpeechRequest } = vi.hoisted(() => {
  const pendingRequests: PendingRequest[] = [];
  const createGenerateSpeechRequest = vi.fn(() => {
    let resolve: (buffer: ArrayBuffer) => void;
    let reject: (error: unknown) => void;
    const promise = new Promise<ArrayBuffer>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const cancel = vi.fn(() => {
      const error = new Error('Request canceled.');
      (error as Error & { code?: string }).code = 'REQUEST_ABORTED';
      reject(error);
    });

    const request = { promise, resolve: resolve!, reject: reject!, cancel };
    pendingRequests.push(request);
    return { promise, cancel };
  });

  return { pendingRequests, createGenerateSpeechRequest };
});

vi.mock('../services/gemini', () => ({ createGenerateSpeechRequest }));

const flushPromises = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('ScriptEngine', () => {
  beforeEach(() => {
    pendingRequests.length = 0;
    createGenerateSpeechRequest.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts inflight requests on stop without stalling a subsequent start', async () => {
    const engine = new ScriptEngine();
    const onError = vi.fn();
    const onAudio = vi.fn();
    engine.on('error', onError);
    engine.on('audio', onAudio);

    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'Zephyr', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);
    expect(pendingRequests).toHaveLength(1);

    engine.stop();
    expect(pendingRequests[0].cancel).toHaveBeenCalledTimes(1);

    await flushPromises();
    expect(onError).not.toHaveBeenCalled();

    await engine.start(
      [{ id: 'block-2', type: BlockType.DIALOGUE, text: 'World', character: 'B' }],
      voiceConfigs
    );
    expect(pendingRequests).toHaveLength(2);

    pendingRequests[1].resolve(new ArrayBuffer(4));
    await flushPromises();

    expect(onAudio).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'block-2' })
    );
  });

  it('does not retry after stop when rate-limited during backoff', async () => {
    vi.useFakeTimers();
    const engine = new ScriptEngine();
    const onError = vi.fn();
    engine.on('error', onError);

    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'Zephyr', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);
    expect(pendingRequests).toHaveLength(1);

    const rateLimitError = new Error('429 RESOURCE_EXHAUSTED');
    (rateLimitError as Error & { status?: number; code?: string }).status = 429;
    (rateLimitError as Error & { status?: number; code?: string }).code = 'RATE_LIMITED';
    pendingRequests[0].reject(rateLimitError);
    await flushPromises();

    engine.stop();
    await vi.runAllTimersAsync();
    await flushPromises();

    expect(pendingRequests).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
