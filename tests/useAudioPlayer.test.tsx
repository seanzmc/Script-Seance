import React, { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { BlockType, ScriptBlock, VoiceConfig } from '../types';

type EngineLike = {
  emit: (event: string, payload: unknown) => void;
};

let lastEngine: EngineLike | null = null;

vi.mock('../services/scriptEngine', () => {
  class MockEngine {
    private listeners = new Map<string, Set<(data: unknown) => void>>();

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastEngine = this;
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
      this.listeners.get(event)?.forEach(handler => handler(payload));
    }

    start = vi.fn();
    stop = vi.fn();
    generateSingle = vi.fn();
  }

  return { ScriptEngine: MockEngine };
});

type HarnessProps = {
  voiceConfigs: VoiceConfig[];
  onError?: (error: unknown, fallbackMessage: string) => void;
  onSkip?: (block: ScriptBlock, error: unknown) => void;
};

const Harness = forwardRef((props: HarnessProps, ref) => {
  const player = useAudioPlayer(props.voiceConfigs, props.onError, props.onSkip);
  useImperativeHandle(ref, () => player);
  return null;
});
Harness.displayName = 'Harness';

describe('useAudioPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    lastEngine = null;
  });

  it('pauses on the current block when audio generation fails', async () => {
    const blocks: ScriptBlock[] = [
      { id: 'block-1', type: BlockType.DIALOGUE, text: 'Hello', character: 'A' },
      { id: 'block-2', type: BlockType.DIALOGUE, text: 'World', character: 'B' }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'Zephyr', speed: 1, pitch: 0 }
    ];
    const onError = vi.fn();
    const onSkip = vi.fn();
    const ref = React.createRef<ReturnType<typeof useAudioPlayer>>();

    render(<Harness ref={ref} voiceConfigs={voiceConfigs} onError={onError} onSkip={onSkip} />);

    await act(async () => {
      ref.current.playScript(blocks);
      vi.runAllTimers();
    });

    expect(ref.current.currentBlockId).toBe('block-1');

    await act(async () => {
      if (!lastEngine) {
        throw new Error('Engine not initialized');
      }
      lastEngine.emit('error', { error: new Error('fail'), blockId: 'block-1', skipped: true });
    });

    expect(ref.current.currentBlockId).toBe('block-1');
    expect(ref.current.isPaused).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith(blocks[0], expect.any(Error));
    expect(onError).not.toHaveBeenCalled();
  });
});
