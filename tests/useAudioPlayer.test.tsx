import React, { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { BlockType, ScriptBlock, VoiceConfig, TtsVoice } from '../types';

type EngineLike = {
  emit: (event: string, payload: unknown) => void;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  generateSingle: ReturnType<typeof vi.fn>;
  clearAudioCache: ReturnType<typeof vi.fn>;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

let lastEngine: EngineLike | null = null;
const originalAudioContext = (window as Window & { AudioContext?: typeof AudioContext }).AudioContext;
const originalWebkitAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  detune = { value: 0 };
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start() {
    this.onended?.();
  }
  stop() {}
}

class MockAudioContext {
  state: AudioContextState = 'running';
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async () => {
    throw new Error('decode not supported in mock');
  });
  createBufferSource() {
    return new MockAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => undefined } as unknown as GainNode;
  }
  createBuffer(_numChannels: number, frameCount: number) {
    return {
      getChannelData: () => new Float32Array(frameCount)
    } as unknown as AudioBuffer;
  }
}

vi.mock('../services/scriptEngine', () => {
  class MockEngine {
    private listeners = new Map<string, Set<(data: unknown) => void>>();

    constructor() {
      lastEngine = this as unknown as EngineLike;
    }

    on(event: string, handler: (data: unknown) => void) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)?.add(handler);
    }

    off(event: string, handler: (data: unknown) => void) {
      this.listeners.get(event)?.delete(handler);
    }

    emit(event: string, payload: unknown) {
      this.listeners.get(event)?.forEach((handler) => handler(payload));
    }

    start = vi.fn();
    stop = vi.fn();
    generateSingle = vi.fn(async () => new ArrayBuffer(8));
    clearAudioCache = vi.fn();
  }

  return { ScriptEngine: MockEngine };
});

type HarnessProps = {
  voiceConfigs: VoiceConfig[];
  blocks?: ScriptBlock[];
  scriptId?: string;
  voiceContextRevision?: number;
  availableVoices?: TtsVoice[];
  characterVoicePreferences?: Record<string, string>;
  narratorVoicePreference?: string;
  onError?: (error: unknown, fallbackMessage: string) => void;
  onSkip?: (block: ScriptBlock, error: unknown) => void;
};

const Harness = forwardRef((props: HarnessProps, ref) => {
  const player = useAudioPlayer(props.voiceConfigs, props.onError, props.onSkip, {
    blocks: props.blocks,
    scriptId: props.scriptId,
    voiceContextRevision: props.voiceContextRevision,
    availableVoices: props.availableVoices,
    characterVoicePreferences: props.characterVoicePreferences,
    narratorVoicePreference: props.narratorVoicePreference
  });
  useImperativeHandle(ref, () => player);
  return null;
});
Harness.displayName = 'Harness';

const getEngine = () => {
  if (!lastEngine) {
    throw new Error('Engine not initialized');
  }
  return lastEngine;
};

describe('useAudioPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as Window & { AudioContext?: typeof AudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext;
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
      MockAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    (window as Window & { AudioContext?: typeof AudioContext }).AudioContext = originalAudioContext;
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = originalWebkitAudioContext;
    lastEngine = null;
  });

  it('pauses on the current block when audio generation fails', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' },
      { id: 'block-2', type: BlockType.DIALOGUE, text: 'World', blockRevision: 1, character: 'B' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const onError = vi.fn();
    const onSkip = vi.fn();
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        onError={onError}
        onSkip={onSkip}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(ref.current.currentBlockId).toBe('block-1');

    await act(async () => {
      getEngine().emit('error', { error: new Error('fail'), blockId: 'block-1', skipped: true });
    });

    expect(ref.current.currentBlockId).toBe('block-1');
    expect(ref.current.isPaused).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith(blocks[0], expect.any(Error));
    expect(onError).not.toHaveBeenCalled();
  });

  it('clears reusable generated blocks when a character voice changes', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const initialVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const updatedVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'inworld-voice-2', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();
    const { rerender } = render(
      <Harness
        ref={ref}
        voiceConfigs={initialVoices}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    await act(async () => {
      const runId = getEngine().start.mock.calls[0]?.[2]?.playbackRunId as number;
      getEngine().emit('audio', {
        blockId: 'block-1',
        audioBuffer: new ArrayBuffer(8),
        voiceId: 'inworld-voice-1',
        speed: 1,
        pitch: 0,
        expressive: false,
        playbackRunId: runId
      });
    });

    expect(ref.current.blockStatuses['block-1']).toBe('ready');

    rerender(
      <Harness
        ref={ref}
        voiceConfigs={updatedVoices}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={2}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(ref.current.blockStatuses['block-1']).toBe('generating');
  });

  it('uses the latest character assignment when playback starts immediately after rerender', () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const initialVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'narrator-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'old-character-voice', speed: 1, pitch: 0 }
    ];
    const updatedVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'narrator-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'new-character-voice', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();
    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <Harness
            ref={ref}
            voiceConfigs={initialVoices}
            blocks={blocks}
            scriptId="script-1"
            voiceContextRevision={1}
          />
        );
      });

      flushSync(() => {
        root.render(
          <Harness
            ref={ref}
            voiceConfigs={updatedVoices}
            blocks={blocks}
            scriptId="script-1"
            voiceContextRevision={2}
          />
        );
      });

      ref.current?.playScript(blocks);
      vi.runAllTimers();

      expect(getEngine().start).toHaveBeenCalledWith(
        blocks,
        expect.arrayContaining([
          expect.objectContaining({ name: 'A', voiceId: 'new-character-voice' })
        ]),
        expect.objectContaining({ voiceContextRevision: 2 })
      );
    } finally {
      flushSync(() => {
        root.unmount();
      });
    }
  });

  it('uses the latest narrator assignment for non-dialogue playback when playback starts immediately after rerender', () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.ACTION, text: 'A cold wind moves through the hall.', blockRevision: 1 }
    ];
    const initialVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'old-narrator-voice', speed: 1, pitch: 0 }
    ];
    const updatedVoices: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'new-narrator-voice', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();
    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <Harness
            ref={ref}
            voiceConfigs={initialVoices}
            blocks={blocks}
            scriptId="script-1"
            voiceContextRevision={1}
          />
        );
      });

      flushSync(() => {
        root.render(
          <Harness
            ref={ref}
            voiceConfigs={updatedVoices}
            blocks={blocks}
            scriptId="script-1"
            voiceContextRevision={2}
          />
        );
      });

      ref.current?.playScript(blocks);
      vi.runAllTimers();

      expect(getEngine().start).toHaveBeenCalledWith(
        blocks,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Narrator', voiceId: 'new-narrator-voice' })
        ]),
        expect.objectContaining({ voiceContextRevision: 2 })
      );
    } finally {
      flushSync(() => {
        root.unmount();
      });
    }
  });

  it('drops stale playback chunk when playbackRunId changes', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    const firstRunId = getEngine().start.mock.calls[0]?.[2]?.playbackRunId as number;

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    const secondRunId = getEngine().start.mock.calls[1]?.[2]?.playbackRunId as number;
    expect(secondRunId).toBeGreaterThan(firstRunId);

    await act(async () => {
      getEngine().emit('audio', {
        blockId: 'block-1',
        audioBuffer: new ArrayBuffer(8),
        voiceId: 'inworld-voice-1',
        speed: 1,
        pitch: 0,
        expressive: false,
        playbackRunId: firstRunId
      });
    });

    expect(ref.current.blockStatuses['block-1']).toBe('generating');

    await act(async () => {
      getEngine().emit('audio', {
        blockId: 'block-1',
        audioBuffer: new ArrayBuffer(8),
        voiceId: 'inworld-voice-1',
        speed: 1,
        pitch: 0,
        expressive: false,
        playbackRunId: secondRunId
      });
    });

    expect(ref.current.blockStatuses['block-1']).toBe('ready');
  });

  it('refresh supersedes prefetch and forces a new playback synthesis request', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    await act(async () => {
      ref.current.playScript(blocks, { forceRegenerate: true });
      vi.runAllTimers();
    });

    expect(getEngine().start).toHaveBeenCalledTimes(2);
    const firstOptions = getEngine().start.mock.calls[0]?.[2] as { playbackRunId?: number; clearCache?: boolean };
    const secondOptions = getEngine().start.mock.calls[1]?.[2] as { playbackRunId?: number; clearCache?: boolean };
    expect(firstOptions.playbackRunId).not.toBe(secondOptions.playbackRunId);
    expect(secondOptions.clearCache).toBe(true);

    await act(async () => {
      getEngine().emit('audio', {
        blockId: 'block-1',
        audioBuffer: new ArrayBuffer(8),
        voiceId: 'inworld-voice-1',
        speed: 1,
        pitch: 0,
        expressive: false,
        playbackRunId: firstOptions.playbackRunId
      });
    });

    expect(ref.current.blockStatuses['block-1']).toBe('generating');
  });

  it('discards stale buffered audio when blockRevision changes before playback reaches that block', async () => {
    const originalStart = MockAudioBufferSourceNode.prototype.start;
    MockAudioBufferSourceNode.prototype.start = function startWithoutAutoEnd() {};
    try {
      const initialBlocks: ScriptBlock[] = [
        { id: 'block-1', type: BlockType.DIALOGUE, text: 'Line one', blockRevision: 1, character: 'A' },
        { id: 'block-2', type: BlockType.DIALOGUE, text: 'Line two', blockRevision: 1, character: 'A' }
      ];
      const revisedBlocks: ScriptBlock[] = [
        { id: 'block-1', type: BlockType.DIALOGUE, text: 'Line one', blockRevision: 1, character: 'A' },
        { id: 'block-2', type: BlockType.DIALOGUE, text: 'Line two', blockRevision: 2, character: 'A' }
      ];
      const voiceConfigs: VoiceConfig[] = [
        { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 },
        { name: 'A', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
      ];
      const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();
      const { rerender } = render(
        <Harness
          ref={ref}
          voiceConfigs={voiceConfigs}
          blocks={initialBlocks}
          scriptId="script-1"
          voiceContextRevision={1}
        />
      );

      await act(async () => {
        ref.current.playScript(initialBlocks);
        vi.runAllTimers();
      });

      const firstRunId = getEngine().start.mock.calls[0]?.[2]?.playbackRunId as number;
      await act(async () => {
        getEngine().emit('audio', {
          blockId: 'block-1',
          audioBuffer: new ArrayBuffer(8),
          voiceId: 'inworld-voice-1',
          speed: 1,
          pitch: 0,
          expressive: false,
          playbackRunId: firstRunId,
          blockRevision: 1,
          voiceContextRevision: 1
        });
      });

      await act(async () => {
        getEngine().emit('audio', {
          blockId: 'block-2',
          audioBuffer: new ArrayBuffer(8),
          voiceId: 'inworld-voice-1',
          speed: 1,
          pitch: 0,
          expressive: false,
          playbackRunId: firstRunId,
          blockRevision: 1,
          voiceContextRevision: 1
        });
      });

      await act(async () => {
        rerender(
          <Harness
            ref={ref}
            voiceConfigs={voiceConfigs}
            blocks={revisedBlocks}
            scriptId="script-1"
            voiceContextRevision={1}
          />
        );
      });

      getEngine().generateSingle.mockResolvedValueOnce(new ArrayBuffer(16));
      await act(async () => {
        ref.current.goToNext();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(getEngine().generateSingle).toHaveBeenCalledTimes(1);
      expect(getEngine().generateSingle).toHaveBeenCalledWith(
        'Line two',
        'inworld-voice-1',
        expect.objectContaining({ requestId: expect.stringContaining('playback-regenerate:block-2') })
      );
    } finally {
      MockAudioBufferSourceNode.prototype.start = originalStart;
    }
  });

  it('drops retry result when blockRevision changes before resolve', async () => {
    const initialBlocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const revisedBlocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 2, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const pendingRetry = deferred<ArrayBuffer>();
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    const { rerender } = render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={initialBlocks}
        scriptId="script-1"
        voiceContextRevision={1}
      />
    );

    await act(async () => {
      ref.current.playScript(initialBlocks);
      vi.runAllTimers();
    });

    await act(async () => {
      ref.current.pause();
    });

    getEngine().generateSingle.mockImplementationOnce((_text: string, _voiceId: string, options?: { signal?: AbortSignal }) => {
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          const abortError = new Error('Request canceled.') as Error & { code?: string };
          abortError.code = 'REQUEST_ABORTED';
          pendingRetry.reject(abortError);
        }, { once: true });
      }
      return pendingRetry.promise;
    });

    let retryPromise: Promise<void> = Promise.resolve();
    act(() => {
      retryPromise = ref.current.retryCurrentBlock();
    });

    await act(async () => {
      rerender(
        <Harness
          ref={ref}
          voiceConfigs={voiceConfigs}
          blocks={revisedBlocks}
          scriptId="script-1"
          voiceContextRevision={1}
        />
      );
    });

    pendingRetry.resolve(new ArrayBuffer(8));
    await act(async () => {
      await retryPromise;
    });

    expect(ref.current.blockStatuses['block-1']).toBe('notGenerated');
  });

  it('manual retry button still issues a fresh generation request', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Retry me', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    await act(async () => {
      ref.current.pause();
    });

    getEngine().generateSingle.mockResolvedValueOnce(new ArrayBuffer(12));
    await act(async () => {
      await ref.current.retryCurrentBlock();
    });

    expect(getEngine().generateSingle).toHaveBeenCalledTimes(1);
    expect(getEngine().generateSingle).toHaveBeenCalledWith(
      'Retry me',
      'inworld-voice-1',
      expect.objectContaining({ requestId: expect.stringContaining('retry:block-1:') })
    );
  });

  it('uses the assigned character voice for retry when a dialogue speaker label has trailing punctuation', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Retry me', blockRevision: 1, character: 'A:' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'olivia-voice', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      },
      {
        id: 'olivia-voice',
        displayName: 'Olivia',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Feminine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        characterVoicePreferences={{ a: 'female' }}
        narratorVoicePreference="male"
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    await act(async () => {
      ref.current.pause();
    });

    getEngine().generateSingle.mockResolvedValueOnce(new ArrayBuffer(12));
    await act(async () => {
      await ref.current.retryCurrentBlock();
    });

    expect(getEngine().generateSingle).toHaveBeenCalledWith(
      'Retry me',
      'olivia-voice',
      expect.objectContaining({ requestId: expect.stringContaining('retry:block-1:') })
    );
  });

  it('uses the assigned character voice for retry when a dialogue speaker label includes a title prefix', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Retry me', blockRevision: 1, character: 'DR. ALEX' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'Alex', voiceId: 'olivia-voice', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      },
      {
        id: 'olivia-voice',
        displayName: 'Olivia',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Feminine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        characterVoicePreferences={{ alex: 'female' }}
        narratorVoicePreference="male"
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    await act(async () => {
      ref.current.pause();
    });

    getEngine().generateSingle.mockResolvedValueOnce(new ArrayBuffer(12));
    await act(async () => {
      await ref.current.retryCurrentBlock();
    });

    expect(getEngine().generateSingle).toHaveBeenCalledWith(
      'Retry me',
      'olivia-voice',
      expect.objectContaining({ requestId: expect.stringContaining('retry:block-1:') })
    );
  });

  it('surfaces preview 429 as RATE_LIMITED and not REQUEST_ABORTED', async () => {
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];
    const onError = vi.fn();
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={[]}
        scriptId="script-1"
        voiceContextRevision={1}
        onError={onError}
      />
    );

    const rateLimitError = new Error('Too many requests') as Error & { code?: string; status?: number };
    rateLimitError.code = 'RATE_LIMITED';
    rateLimitError.status = 429;
    getEngine().generateSingle.mockRejectedValueOnce(rateLimitError);

    await act(async () => {
      await ref.current.playPreview('Preview this', voiceConfigs[0], { scopeId: 'narrator-preview' });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RATE_LIMITED', status: 429 }),
      'Preview audio failed.'
    );
    const surfacedError = onError.mock.calls[0]?.[0] as { code?: string };
    expect(surfacedError.code).not.toBe('REQUEST_ABORTED');
  });

  it('sanitizes disallowed narrator preview voices to Mark before generation', async () => {
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'Hades', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={[]}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        narratorVoicePreference="male"
      />
    );

    getEngine().generateSingle.mockResolvedValueOnce(new ArrayBuffer(12));
    await act(async () => {
      await ref.current.playPreview('Narration', voiceConfigs[0], { scopeId: 'narrator-preview' });
    });

    expect(getEngine().generateSingle).toHaveBeenCalledWith(
      'Narration',
      'mark-voice',
      expect.any(Object)
    );
  });

  it('sanitizes invalid character playback voices using the preference-aware auto pool', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'A' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'A', voiceId: 'missing-voice', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      },
      {
        id: 'female-auto',
        displayName: 'Olivia',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Feminine'
      },
      {
        id: 'manual-only',
        displayName: 'Manual Only',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: false,
        gender: 'Feminine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        characterVoicePreferences={{ a: 'female' }}
        narratorVoicePreference="male"
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(getEngine().start).toHaveBeenCalledWith(
      blocks,
      expect.arrayContaining([
        expect.objectContaining({ name: 'A', voiceId: 'female-auto' })
      ]),
      expect.any(Object)
    );
  });

  it('uses only the combined curated auto pool for random character fallback', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'B' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'B', voiceId: 'missing-voice', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      },
      {
        id: 'combined-auto',
        displayName: 'Ashley',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Feminine'
      },
      {
        id: 'selectable-only',
        displayName: 'Selectable Only',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: false,
        gender: 'Feminine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        characterVoicePreferences={{ b: 'random' }}
        narratorVoicePreference="male"
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(getEngine().start).toHaveBeenCalledWith(
      blocks,
      expect.arrayContaining([
        expect.objectContaining({ name: 'B', voiceId: 'combined-auto' })
      ]),
      expect.any(Object)
    );
  });

  it('preserves a valid manually selected selectable-only voice instead of auto-reassigning it', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', blockRevision: 1, character: 'C' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'C', voiceId: 'manual-only', speed: 1, pitch: 0 }
    ];
    const availableVoices: TtsVoice[] = [
      {
        id: 'mark-voice',
        displayName: 'Mark',
        source: 'inworld-premade',
        labels: ['narrator', 'professional'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Masculine'
      },
      {
        id: 'female-auto',
        displayName: 'Olivia',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: true,
        gender: 'Feminine'
      },
      {
        id: 'manual-only',
        displayName: 'Manual Only',
        source: 'inworld-premade',
        labels: ['feminine'],
        isCustom: false,
        autoAssignable: false,
        gender: 'Feminine'
      }
    ];
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(
      <Harness
        ref={ref}
        voiceConfigs={voiceConfigs}
        blocks={blocks}
        scriptId="script-1"
        voiceContextRevision={1}
        availableVoices={availableVoices}
        characterVoicePreferences={{ c: 'female' }}
        narratorVoicePreference="male"
      />
    );

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(getEngine().start).toHaveBeenCalledWith(
      blocks,
      expect.arrayContaining([
        expect.objectContaining({ name: 'C', voiceId: 'manual-only' })
      ]),
      expect.any(Object)
    );
  });
});
