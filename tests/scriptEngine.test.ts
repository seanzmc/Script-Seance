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

vi.mock('../services/ai', () => ({ createGenerateSpeechRequest }));

const flushPromises = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('ScriptEngine', () => {
  beforeEach(() => {
    const cacheResetEngine = new ScriptEngine();
    cacheResetEngine.clearAudioCache();
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
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);
    expect(pendingRequests).toHaveLength(1);

    engine.stop();
    expect(pendingRequests[0].cancel).toHaveBeenCalledTimes(1);

    await flushPromises();
    expect(onError).not.toHaveBeenCalled();

    await engine.start(
      [{ id: 'block-2', type: BlockType.DIALOGUE, text: 'World', blockRevision: 1, character: 'B' }],
      voiceConfigs
    );
    expect(pendingRequests).toHaveLength(2);

    pendingRequests[1].resolve(new ArrayBuffer(4));
    await flushPromises();

    expect(onAudio).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'block-2' })
    );
  });

  it('does not automatically retry block generation after a rate-limit error', async () => {
    const engine = new ScriptEngine();
    const onError = vi.fn();
    engine.on('error', onError);

    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);
    expect(pendingRequests).toHaveLength(1);

    const rateLimitError = new Error('429 RESOURCE_EXHAUSTED');
    (rateLimitError as Error & { status?: number; code?: string }).status = 429;
    (rateLimitError as Error & { status?: number; code?: string }).code = 'RATE_LIMITED';
    pendingRequests[0].reject(rateLimitError);
    await flushPromises();

    expect(pendingRequests).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: 'block-1',
        skipped: true,
        attempts: 1,
        error: expect.objectContaining({ status: 429, code: 'RATE_LIMITED' })
      })
    );
  });

  it('uses the assigned character voice when dialogue speaker labels include trailing punctuation', async () => {
    const engine = new ScriptEngine();
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A:' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'olivia-voice', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);

    expect(createGenerateSpeechRequest).toHaveBeenCalledWith(
      'Hello',
      'olivia-voice',
      undefined,
      expect.any(Object)
    );
  });

  it('uses the assigned character voice when legacy speaker field is present', async () => {
    const engine = new ScriptEngine();
    const blocks = [
      {
        id: 'block-1',
        type: BlockType.DIALOGUE,
        text: 'Hello',
        blockRevision: 1,
        speaker: 'A'
      }
    ] as unknown as ScriptBlock[];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'olivia-voice', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);

    expect(createGenerateSpeechRequest).toHaveBeenCalledWith(
      'Hello',
      'olivia-voice',
      undefined,
      expect.any(Object)
    );
  });

  it('surfaces preview 429 as RATE_LIMITED and not REQUEST_ABORTED', async () => {
    const engine = new ScriptEngine();
    const previewPromise = engine.generateSingle('Hello', 'inworld-voice-1');
    expect(pendingRequests).toHaveLength(1);

    const rateLimitError = new Error('Too many requests') as Error & { status?: number; code?: string };
    rateLimitError.status = 429;
    rateLimitError.code = 'RATE_LIMITED';
    pendingRequests[0].reject(rateLimitError);

    try {
      await previewPromise;
      throw new Error('Expected preview to reject');
    } catch (error) {
      expect(error).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED'
      });
      expect((error as { code?: string }).code).not.toBe('REQUEST_ABORTED');
    }

    expect(pendingRequests).toHaveLength(1);
  });

  it('reuses cached audio when blockRevision is unchanged', async () => {
    const engine = new ScriptEngine();
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello there', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    await engine.start(blocks, voiceConfigs);
    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
    pendingRequests[0].resolve(new ArrayBuffer(4));
    await flushPromises();

    await engine.start(blocks, voiceConfigs);
    await flushPromises();

    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
  });

  it('does not reuse cached audio when blockRevision changes', async () => {
    const engine = new ScriptEngine();
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    await engine.start(
      [{ id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello there', blockRevision: 1, character: 'A' }],
      voiceConfigs
    );
    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
    pendingRequests[0].resolve(new ArrayBuffer(4));
    await flushPromises();

    await engine.start(
      [{ id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello there', blockRevision: 2, character: 'A' }],
      voiceConfigs
    );

    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(2);
    pendingRequests[1].resolve(new ArrayBuffer(4));
    await flushPromises();
  });

  it('reuses preview cache for whitespace-equivalent text', async () => {
    const engine = new ScriptEngine();

    const firstPromise = engine.generateSingle('Line one\n   line two', 'inworld-voice-1');
    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
    pendingRequests[0].resolve(new ArrayBuffer(8));
    await firstPromise;

    const secondPromise = engine.generateSingle('Line one line two', 'inworld-voice-1');
    await secondPromise;

    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
  });

  it('does not reuse preview cache for case-different text', async () => {
    const engine = new ScriptEngine();

    const firstPromise = engine.generateSingle('Case Sensitive Line', 'inworld-voice-1');
    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(1);
    pendingRequests[0].resolve(new ArrayBuffer(8));
    await firstPromise;

    const secondPromise = engine.generateSingle('case sensitive line', 'inworld-voice-1');
    expect(createGenerateSpeechRequest).toHaveBeenCalledTimes(2);
    pendingRequests[1].resolve(new ArrayBuffer(8));
    await secondPromise;
  });
});
