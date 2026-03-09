import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { BlockType, StoryContext } from '../types';

const contextFixture: StoryContext = {
  title: 'Header Controls Draft',
  genre: 'Noir',
  premise: 'A detective uncovers a conspiracy.',
  characters: ['Alex', 'Sam'],
  scenes: [
    {
      id: 's1',
      heading: 'INT. OFFICE - NIGHT',
      summary: 'Alex studies evidence in silence.',
      blocks: [
        {
          id: 'b1',
          type: BlockType.ACTION,
          text: 'Alex studies the evidence board under flickering light.',
          blockRevision: 1
        },
        {
          id: 'b2',
          type: BlockType.DIALOGUE,
          character: 'Alex',
          text: 'Something here does not add up.',
          blockRevision: 1
        }
      ]
    }
  ]
};

const createProps = (overrides: Partial<ScriptPaneProps> = {}): ScriptPaneProps => ({
  context: contextFixture,
  titleInputRef: createRef<HTMLInputElement>(),
  onTitleChange: vi.fn(),
  suggestedTitle: null,
  isSuggestingTitle: false,
  suggestedTitleDismissed: false,
  onUseSuggestedTitle: vi.fn(),
  onDismissSuggestedTitle: vi.fn(),
  onClearDraft: vi.fn(),
  autosaveError: null,
  error: null,
  userInstruction: '',
  onInstructionChange: vi.fn(),
  onGenerateNext: vi.fn(),
  onPlotTwist: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: true,
  canRedo: true,
  insertCompleteToken: 0,
  onChangeSpeaker: vi.fn(),
  onInsertError: vi.fn(),
  onToggleLock: vi.fn(),
  isGenerating: false,
  isPlaying: false,
  onCancelGenerate: vi.fn(),
  currentBlockId: null,
  currentBlockIndex: -1,
  blockStatuses: {},
  showHighlights: true,
  autoScroll: false,
  onOpenPrivacy: vi.fn(),
  onExportTxt: vi.fn(),
  onExportPdf: vi.fn(),
  canExport: true,
  insertScrollTargetId: null,
  insertScrollToken: 0,
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ScriptPane draft workspace chrome', () => {
  it('shows the visible composer and removes the old hidden generate/export header controls', () => {
    const onPlotTwist = vi.fn();
    render(<ScriptPane {...createProps({ onPlotTwist })} />);

    expect(screen.getByText('Draft Composer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue Writing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plot Twist' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insert Scene / New Beat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open generate menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open export menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear Draft' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Plot Twist' }));
    expect(onPlotTwist).toHaveBeenCalledTimes(1);
  });

  it('opens the inline insert composer from the visible draft composer action', async () => {
    render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert Scene / New Beat' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
    });
  });

  it('renders a slimmer meta strip with title/style editing and undo redo controls', () => {
    render(<ScriptPane {...createProps({ onSaveStyle: vi.fn() })} />);

    expect(screen.getByText('Draft Workspace')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Style' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByText('Genre:')).toBeTruthy();
    expect(screen.getByText('Style:')).toBeTruthy();
    expect(screen.getAllByText('1 scene')).toHaveLength(2);
    expect(screen.queryByText('Draft saves locally')).toBeTruthy();
  });

  it('keeps title and style editors toggleable from the slimmer meta strip', async () => {
    render(<ScriptPane {...createProps({ onSaveStyle: vi.fn() })} />);

    const editTitleButton = screen.getByRole('button', { name: 'Edit Title' });
    fireEvent.click(editTitleButton);
    expect(screen.getByRole('dialog', { name: 'Edit title' })).toBeTruthy();
    fireEvent.click(editTitleButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit title' })).toBeNull();
    });

    const editStyleButton = screen.getByRole('button', { name: 'Edit Style' });
    fireEvent.click(editStyleButton);
    expect(screen.getByRole('dialog', { name: 'Edit style' })).toBeTruthy();
    fireEvent.click(editStyleButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit style' })).toBeNull();
    });
  });

  it('positions the style editor within the viewport shell above the draft surface', () => {
    render(<ScriptPane {...createProps({ onSaveStyle: vi.fn() })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Style' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit style' });
    const overlay = dialog.parentElement as HTMLElement;

    expect(overlay.className).toContain('z-[110]');
    expect(overlay.className).toContain('top-24');
    expect(overlay.className).toContain('overflow-y-auto');
    expect(dialog.className).toContain('max-h-[calc(100vh-8rem)]');
  });

  it('surfaces the style library above the style editor when browsing', () => {
    render(<ScriptPane {...createProps({ onSaveStyle: vi.fn() })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse library' }));

    const libraryDialog = screen.getByRole('dialog', { name: 'Style Library' });
    const libraryOverlay = libraryDialog.parentElement as HTMLElement;
    expect(libraryOverlay.className).toContain('z-[120]');
  });

  it('shows composer progress inline while keeping the visible draft actions present', () => {
    render(<ScriptPane {...createProps({ isGenerating: true })} />);

    expect(screen.getByText('Working on your request...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue Writing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
