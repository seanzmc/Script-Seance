import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptDisplay } from '../components/ScriptDisplay';
import { BlockType, Scene } from '../types';

const createRect = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  left: 0,
  bottom: top + height,
  right: 0,
  width: 0,
  height,
  toJSON: () => ({})
} as DOMRect);

const scenes: Scene[] = [
  {
    id: 'scene-1',
    heading: 'INT. OFFICE - NIGHT',
    summary: 'A tense exchange.',
    blocks: [
      {
        id: 'heading-1',
        type: BlockType.HEADING,
        text: 'INT. OFFICE - NIGHT',
        blockRevision: 1
      },
      {
        id: 'action-1',
        type: BlockType.ACTION,
        text: 'Alex studies the evidence board.',
        blockRevision: 1
      }
    ]
  }
];

const createProps = () => ({
  scenes,
  currentBlockId: 'action-1',
  currentBlockIndex: 0,
  blockStatuses: {},
  showHighlights: true,
  autoScroll: false,
  onToggleLock: vi.fn(),
  onSelectInsertTarget: vi.fn(),
  onChangeSpeaker: vi.fn(),
  characters: ['Alex']
});

describe('ScriptDisplay playback follow behavior', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('uses currentBlockId as the canonical highlighted playback target', async () => {
    render(<ScriptDisplay {...createProps()} />);

    await waitFor(() => {
      expect(document.getElementById('block-action-1')?.className).toContain('script-block-active');
    });
  });

  it('centers the active block within the internal script scroll container when outside the dead-zone', async () => {
    const props = createProps();
    const { rerender } = render(<ScriptDisplay {...props} autoScroll={false} />);

    const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLDivElement;
    const blockElement = document.getElementById('block-action-1') as HTMLDivElement;
    const scrollTo = vi.fn();

    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTo', { value: scrollTo, configurable: true });
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      value: () => createRect(100, 400),
      configurable: true
    });
    Object.defineProperty(blockElement, 'getBoundingClientRect', {
      value: () => createRect(450, 80),
      configurable: true
    });

    rerender(<ScriptDisplay {...props} autoScroll />);

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: 190,
        behavior: 'smooth'
      });
    });
  });

  it('does not micro-scroll when the active block is already inside the center dead-zone', async () => {
    const props = createProps();
    const { rerender } = render(<ScriptDisplay {...props} autoScroll={false} />);

    const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLDivElement;
    const blockElement = document.getElementById('block-action-1') as HTMLDivElement;
    const scrollTo = vi.fn();

    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTo', { value: scrollTo, configurable: true });
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      value: () => createRect(100, 400),
      configurable: true
    });
    Object.defineProperty(blockElement, 'getBoundingClientRect', {
      value: () => createRect(240, 80),
      configurable: true
    });

    rerender(<ScriptDisplay {...props} autoScroll />);

    await waitFor(() => {
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
