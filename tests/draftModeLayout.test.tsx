import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftMode, type DraftModeProps } from '../components/workspace/DraftMode';
import { BlockType, StoryContext } from '../types';

const contextFixture: StoryContext = {
  title: 'Outline Draft',
  genre: 'Noir',
  premise: 'A courier arrives with a tape reel.',
  characters: ['Alex', 'Sam'],
  style: 'Hardboiled',
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. ARCHIVE - NIGHT',
      summary: 'Alex studies the tape reel under failing light.',
      blocks: [
        {
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex sets the reel on the desk and waits for the click.',
          blockRevision: 1
        }
      ]
    },
    {
      id: 'scene-2',
      heading: 'EXT. PIER - DAWN',
      summary: '',
      blocks: [
        {
          id: 'block-2',
          type: BlockType.DIALOGUE,
          character: 'Sam',
          text: 'You brought it anyway.',
          blockRevision: 1
        }
      ]
    }
  ]
};

const createProps = (overrides: Partial<DraftModeProps> = {}): DraftModeProps => ({
  context: contextFixture,
  titleInputRef: createRef<HTMLInputElement>(),
  onTitleChange: vi.fn(),
  autosaveError: null,
  error: null,
  userInstruction: 'Lean harder into dread.',
  onInstructionChange: vi.fn(),
  onGenerateNext: vi.fn(),
  onPlotTwist: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: true,
  canRedo: true,
  onChangeSpeaker: vi.fn(),
  onToggleLock: vi.fn(),
  isGenerating: false,
  isPlaying: false,
  onCancelGenerate: vi.fn(),
  currentBlockId: 'block-2',
  currentBlockIndex: 1,
  blockStatuses: {},
  showHighlights: true,
  autoScroll: false,
  onSaveStyle: vi.fn(),
  insertScrollTargetId: null,
  insertScrollToken: 0,
  ...overrides
});

describe('DraftMode layout', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the outline from scene data with summary fallback behavior', () => {
    render(<DraftMode {...createProps()} />);

    const firstItem = screen.getByTestId('draft-outline-item-scene-1');
    const secondItem = screen.getByTestId('draft-outline-item-scene-2');

    expect(within(firstItem).getByText('INT. ARCHIVE - NIGHT')).toBeTruthy();
    expect(within(firstItem).getByText('Alex studies the tape reel under failing light.')).toBeTruthy();
    expect(within(secondItem).getByText('EXT. PIER - DAWN')).toBeTruthy();
    expect(within(secondItem).queryByText('Alex studies the tape reel under failing light.')).toBeNull();
    expect(secondItem.getAttribute('aria-pressed')).toBe('true');
  });

  it('navigates to a scene when an outline item is clicked', () => {
    render(<DraftMode {...createProps({ currentBlockId: null })} />);

    const scrollIntoView = HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    fireEvent.click(screen.getByTestId('draft-outline-item-scene-2'));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('draft-outline-item-scene-2').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a visible composer and keeps draft generation actions wired', async () => {
    const onGenerateNext = vi.fn();
    const onInstructionChange = vi.fn();
    render(<DraftMode {...createProps({ onGenerateNext, onInstructionChange })} />);

    expect(screen.getByText('Draft Workspace')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getAllByText('EXT. PIER - DAWN').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByText('Draft Composer')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Draft prompt'), {
      target: { value: 'Push into the next confrontation.' }
    });
    expect(onInstructionChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Continue Writing' }));
    expect(onGenerateNext).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Insert Scene / New Beat' }));
    expect(await screen.findByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
  });
});
