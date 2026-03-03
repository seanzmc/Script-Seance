import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
