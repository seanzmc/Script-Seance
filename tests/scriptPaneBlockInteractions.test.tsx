import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { SetupFormState } from '../components/SetupForm';
import { BlockType, StoryContext } from '../types';

const contextFixture: StoryContext = {
  title: 'Interactive Draft',
  genre: 'Noir',
  premise: 'An investigator confronts a hidden cabal.',
  characters: ['Alex', 'Sam'],
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. ARCHIVE - NIGHT',
      summary: 'Alex finds a critical ledger.',
      blocks: [
        {
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex opens a dusty ledger beneath a failing lamp.',
          blockRevision: 1
        },
        {
          id: 'block-2',
          type: BlockType.DIALOGUE,
          character: 'Alex',
          text: 'This changes everything.',
          blockRevision: 1,
          locked: true
        }
      ]
    }
  ]
};

const setupStateFixture: SetupFormState = {
  genre: 'Noir',
  premise: 'An investigator confronts a hidden cabal.',
  characters: ['Alex', 'Sam'],
  style: '',
  length: 'Medium'
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
  onAddBlock: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: true,
  canRedo: true,
  insertTarget: null,
  insertModeActive: false,
  pendingInsertBlock: null,
  onStartInsertMode: vi.fn(),
  onCancelInsertMode: vi.fn(),
  onConfirmInsertMode: vi.fn(),
  insertCompleteToken: 0,
  onSelectInsertTarget: vi.fn(),
  onChangeSpeaker: vi.fn(),
  onInsertError: vi.fn(),
  onRegenerate: vi.fn(),
  onDeleteBlock: vi.fn(),
  onRequestInsert: vi.fn(),
  onInsertAtIndex: vi.fn(),
  onGenerateInsertAtIndex: vi.fn(async () => {}),
  onToggleLock: vi.fn(),
  isGenerating: false,
  isPlaying: false,
  isRegenerating: false,
  onCancelGenerate: vi.fn(),
  currentBlockId: null,
  currentBlockIndex: -1,
  blockStatuses: {},
  showHighlights: true,
  autoScroll: false,
  onOpenPrivacy: vi.fn(),
  onOpenSetup: vi.fn(),
  isSetupOpen: false,
  onCloseSetup: vi.fn(),
  setupState: setupStateFixture,
  onSetupChange: vi.fn(),
  onStartSetup: vi.fn(),
  setupAutoSurprise: false,
  styleContext: '',
  onExportTxt: vi.fn(),
  onExportPdf: vi.fn(),
  canExport: true,
  voicesContent: <div>Voices panel body</div>,
  insertScrollTargetId: null,
  insertScrollToken: 0,
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ScriptPane block interactions', () => {
  it('opens and closes the insert composer via cancel, escape, and outside click', async () => {
    render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const openComposer = screen.getByRole('dialog', { name: 'Insert Block' });
    expect(openComposer).toBeTruthy();

    fireEvent.click(within(openComposer).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });
  });

  it('manual composer insert sends one block to the correct insert index', () => {
    const onInsertAtIndex = vi.fn();
    render(<ScriptPane {...createProps({ onInsertAtIndex })} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'A deliberate action beat.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert' }));

    expect(onInsertAtIndex).toHaveBeenCalledTimes(1);
    expect(onInsertAtIndex).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: BlockType.ACTION,
        text: 'A deliberate action beat.',
        blockRevision: 1
      })
    );
  });

  it('composer generate shows loading and inline error state on failure', async () => {
    const onGenerateInsertAtIndex = vi.fn(async () => {
      throw new Error('Generation failed');
    });
    render(<ScriptPane {...createProps({ onGenerateInsertAtIndex })} />);

    fireEvent.click(screen.getByTestId('insert-slot-2'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.click(within(composer).getByRole('button', { name: 'Generate' }));

    expect(screen.getByText('Generating...')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Generation failed');
    });
    expect(onGenerateInsertAtIndex).toHaveBeenCalledWith(
      expect.objectContaining({ insertIndex: 2, type: BlockType.ACTION })
    );
  });

  it('activates inline insert slots between blocks and at script end', () => {
    const onRequestInsert = vi.fn();
    render(<ScriptPane {...createProps({ onRequestInsert })} />);

    const betweenSlot = screen.getByTestId('insert-slot-1');
    const endSlot = screen.getByTestId('insert-slot-2');

    fireEvent.click(betweenSlot);
    expect(onRequestInsert).toHaveBeenCalledWith(1);
    expect(betweenSlot.getAttribute('data-active')).toBe('true');
    expect(endSlot.getAttribute('data-active')).toBe('false');

    fireEvent.click(endSlot);
    expect(onRequestInsert).toHaveBeenCalledWith(2);
    expect(endSlot.getAttribute('data-active')).toBe('true');
  });

  it('supports keyboard activation for inline insert slots', () => {
    const onRequestInsert = vi.fn();
    render(<ScriptPane {...createProps({ onRequestInsert })} />);

    const betweenSlot = screen.getByTestId('insert-slot-1');
    betweenSlot.focus();

    fireEvent.keyDown(betweenSlot, { key: 'Enter' });
    fireEvent.keyDown(betweenSlot, { key: ' ' });

    expect(onRequestInsert).toHaveBeenNthCalledWith(1, 1);
    expect(onRequestInsert).toHaveBeenNthCalledWith(2, 1);
  });

  it('selects a block and clears selection on outside click', () => {
    const { container } = render(<ScriptPane {...createProps()} />);

    const block = container.querySelector('#block-block-1') as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.className).toContain('hover:bg-slate-900/[0.045]');

    fireEvent.click(block);
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('selected-block-actions-block-1')).toBeNull();
  });

  it('supports keyboard selection with Enter and clear with Escape', () => {
    const { container } = render(<ScriptPane {...createProps()} />);

    const block = container.querySelector('#block-block-1') as HTMLElement;
    expect(block).toBeTruthy();

    block.focus();
    fireEvent.keyDown(block, { key: 'Enter' });
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('selected-block-actions-block-1')).toBeNull();
  });

  it('routes inline rewrite/delete actions to existing handlers', () => {
    const onRegenerate = vi.fn();
    const onDeleteBlock = vi.fn();
    const { container } = render(
      <ScriptPane {...createProps({ onRegenerate, onDeleteBlock })} />
    );

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    expect(onRegenerate).toHaveBeenCalledWith('scene-1', 'block-1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected block' }));
    expect(onDeleteBlock).toHaveBeenCalledWith('scene-1', 'block-1');
  });

  it('disables inline rewrite for locked blocks and stubs delete when handler is missing', () => {
    const onRegenerate = vi.fn();
    const { container } = render(
      <ScriptPane {...createProps({ onRegenerate, onDeleteBlock: undefined })} />
    );

    const lockedBlock = container.querySelector('#block-block-2') as HTMLElement;
    fireEvent.click(lockedBlock);

    const rewriteButton = screen.getByRole('button', { name: 'Rewrite selected block' }) as HTMLButtonElement;
    const deleteButton = screen.getByRole('button', { name: 'Delete selected block' }) as HTMLButtonElement;

    expect(rewriteButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
    expect(onRegenerate).not.toHaveBeenCalled();
  });
});
