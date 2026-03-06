import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { SetupFormState } from '../components/SetupForm';
import { BlockType, ScriptAnchor, StoryContext } from '../types';

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

const contextWithoutCharacters: StoryContext = {
  ...contextFixture,
  characters: []
};

const contextWithEmptySecondScene: StoryContext = {
  ...contextFixture,
  scenes: [
    contextFixture.scenes[0],
    {
      id: 'scene-2',
      heading: 'EXT. WATERFRONT - DAWN',
      summary: 'A quiet shoreline waits for the next beat.',
      blocks: [],
      meta: {
        placeholder: true,
        source: 'user'
      }
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
  onGenerateRewritePreview: vi.fn(async () => 'A sharper rewrite lands.'),
  onApplyRewritePreview: vi.fn(),
  onDeleteBlock: vi.fn(),
  onRequestInsert: vi.fn(),
  onInsertAtAnchor: vi.fn(),
  onGenerateInsertAtAnchor: vi.fn(async () => {}),
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
  onOpenSetup: vi.fn(),
  isSetupOpen: false,
  onCloseSetup: vi.fn(),
  setupState: setupStateFixture,
  onSetupChange: vi.fn(),
  onStartSetup: vi.fn(),
  setupAutoSurprise: false,
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
    const onInsertAtAnchor = vi.fn();
    render(<ScriptPane {...createProps({ onInsertAtAnchor })} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'A deliberate action beat.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert Typed Block' }));

    expect(onInsertAtAnchor).toHaveBeenCalledTimes(1);
    expect(onInsertAtAnchor).toHaveBeenCalledWith(
      expect.objectContaining<ScriptAnchor>({
        kind: 'block',
        blockId: 'block-1',
        position: 'after',
        id: 'block:block-1:after'
      }),
      expect.objectContaining({
        type: BlockType.ACTION,
        text: 'A deliberate action beat.',
        blockRevision: 1
      })
    );
  });

  it('shows character selector only when dialogue type is selected', () => {
    render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    expect(within(composer).queryByLabelText('Character')).toBeNull();

    fireEvent.click(within(composer).getByRole('tab', { name: 'Dialogue' }));
    const selector = within(composer).getByLabelText('Character') as HTMLSelectElement;
    expect(selector.value).toBe('Alex');
  });

  it('shows dialogue empty state and disables actions when no characters exist', () => {
    render(<ScriptPane {...createProps({ context: contextWithoutCharacters })} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.click(within(composer).getByRole('tab', { name: 'Dialogue' }));

    expect(within(composer).getByText('Add a character first')).toBeTruthy();
    expect((within(composer).getByRole('button', { name: 'Generate and Insert' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(composer).getByRole('button', { name: 'Insert Typed Block' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('dialogue generate request includes selected speaker', () => {
    const onGenerateInsertAtAnchor = vi.fn(async () => {});
    render(<ScriptPane {...createProps({ onGenerateInsertAtAnchor })} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.click(within(composer).getByRole('tab', { name: 'Dialogue' }));
    fireEvent.change(within(composer).getByLabelText('Character'), { target: { value: 'Sam' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Generate and Insert' }));

    expect(onGenerateInsertAtAnchor).toHaveBeenCalledWith(
      expect.objectContaining({ type: BlockType.DIALOGUE, character: 'Sam' })
    );
  });

  it('composer generate shows loading and inline error state on failure', async () => {
    const onGenerateInsertAtAnchor = vi.fn(async () => {
      throw new Error('Generation failed');
    });
    render(<ScriptPane {...createProps({ onGenerateInsertAtAnchor })} />);

    fireEvent.click(screen.getByTestId('insert-slot-2'));
    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.click(within(composer).getByRole('button', { name: 'Generate and Insert' }));

    expect(screen.getByText('Generating...')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Generation failed');
    });
    expect(onGenerateInsertAtAnchor).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: expect.objectContaining<ScriptAnchor>({
          kind: 'block',
          blockId: 'block-2',
          position: 'after',
          id: 'block:block-2:after'
        }),
        type: BlockType.ACTION
      })
    );
  });

  it('activates inline insert slots between blocks and at script end', () => {
    const onRequestInsert = vi.fn();
    render(<ScriptPane {...createProps({ onRequestInsert })} />);

    const betweenSlot = screen.getByTestId('insert-slot-1');
    const endSlot = screen.getByTestId('insert-slot-2');

    fireEvent.click(betweenSlot);
    expect(onRequestInsert).toHaveBeenCalledWith(expect.objectContaining<ScriptAnchor>({
      kind: 'block',
      blockId: 'block-1',
      position: 'after',
      id: 'block:block-1:after'
    }));
    expect(betweenSlot.getAttribute('data-active')).toBe('true');
    expect(endSlot.getAttribute('data-active')).toBe('false');

    fireEvent.click(endSlot);
    expect(onRequestInsert).toHaveBeenCalledWith(expect.objectContaining<ScriptAnchor>({
      kind: 'block',
      blockId: 'block-2',
      position: 'after',
      id: 'block:block-2:after'
    }));
    expect(endSlot.getAttribute('data-active')).toBe('true');
  });

  it('toggles inline insert slots closed when the same slot is activated again from the keyboard', async () => {
    const onRequestInsert = vi.fn();
    render(<ScriptPane {...createProps({ onRequestInsert })} />);

    const betweenSlot = screen.getByTestId('insert-slot-1');
    betweenSlot.focus();

    fireEvent.keyDown(betweenSlot, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();

    fireEvent.keyDown(betweenSlot, { key: ' ' });

    expect(onRequestInsert).toHaveBeenCalledTimes(1);
    expect(onRequestInsert).toHaveBeenCalledWith(expect.objectContaining<ScriptAnchor>({
      kind: 'block',
      blockId: 'block-1',
      position: 'after',
      id: 'block:block-1:after'
    }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });
  });

  it('toggles inline insert slots closed when the same slot is clicked twice', async () => {
    render(<ScriptPane {...createProps()} />);

    const betweenSlot = screen.getByTestId('insert-slot-1');
    fireEvent.click(betweenSlot);
    expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();

    fireEvent.click(betweenSlot);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });
  });

  it('shows Generate Next Scene only on the end insert slot and routes to append scene', async () => {
    const onGenerateNext = vi.fn();
    render(<ScriptPane {...createProps({ onGenerateNext })} />);

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    expect(screen.queryByRole('button', { name: 'Generate Next Scene' })).toBeNull();

    fireEvent.click(screen.getByTestId('insert-slot-2'));
    const generateNextSceneButton = screen.getByRole('button', { name: 'Generate Next Scene' });
    fireEvent.click(generateNextSceneButton);

    expect(onGenerateNext).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert Block' })).toBeNull();
    });
  });

  it('disables end-slot Generate Next Scene while playback or generation is active', () => {
    const onGenerateNext = vi.fn();
    const { unmount } = render(
      <ScriptPane {...createProps({ onGenerateNext, isPlaying: true })} />
    );

    fireEvent.click(screen.getByTestId('insert-slot-2'));
    const playingDisabledButton = screen.getByRole('button', { name: 'Generate Next Scene' }) as HTMLButtonElement;
    expect(playingDisabledButton.disabled).toBe(true);
    fireEvent.click(playingDisabledButton);
    expect(onGenerateNext).toHaveBeenCalledTimes(0);

    unmount();
    render(<ScriptPane {...createProps({ onGenerateNext, isGenerating: true })} />);
    fireEvent.click(screen.getByTestId('insert-slot-2'));
    const generatingDisabledButton = screen.getByRole('button', { name: 'Generate Next Scene' }) as HTMLButtonElement;
    expect(generatingDisabledButton.disabled).toBe(true);
    fireEvent.click(generatingDisabledButton);
    expect(onGenerateNext).toHaveBeenCalledTimes(0);
  });

  it('routes insert panel Add to End through the same anchor insert callback', () => {
    const onInsertAtAnchor = vi.fn();
    render(<ScriptPane {...createProps({ onInsertAtAnchor })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An ending beat closes the scene.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to End' }));

    expect(onInsertAtAnchor).toHaveBeenCalledTimes(1);
    expect(onInsertAtAnchor).toHaveBeenCalledWith(
      expect.objectContaining<ScriptAnchor>({
        kind: 'block',
        blockId: 'block-2',
        position: 'after',
        id: 'block:block-2:after'
      }),
      expect.objectContaining({
        type: BlockType.ACTION,
        text: 'An ending beat closes the scene.'
      })
    );
  });

  it('selects a block and clears selection on outside click', () => {
    const { container } = render(<ScriptPane {...createProps()} />);

    const block = container.querySelector('#block-block-1') as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.className).toContain('hover:border-blue-300');

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

  it('opens rewrite composer from inline actions and keeps delete flow wired', async () => {
    const onDeleteBlock = vi.fn();
    const { container } = render(
      <ScriptPane {...createProps({ onDeleteBlock })} />
    );

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    expect(screen.getByRole('dialog', { name: 'Rewrite Block' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected block' }));
    expect(onDeleteBlock).toHaveBeenCalledWith('scene-1', 'block-1');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rewrite Block' })).toBeNull();
    });
  });

  it('opens insert actions from a selected block and supports before/after placement', () => {
    const onInsertAtAnchor = vi.fn();
    const { container } = render(
      <ScriptPane {...createProps({ onInsertAtAnchor })} />
    );

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);
    fireEvent.click(screen.getByRole('button', { name: 'Insert near selected block' }));

    let composer = screen.getByRole('dialog', { name: 'Insert Block' });
    expect(within(composer).getByRole('button', { name: 'Insert Before' })).toBeTruthy();
    expect(within(composer).getByRole('button', { name: 'Insert After' })).toBeTruthy();
    expect(within(composer).getAllByRole('button').at(-1)?.textContent).toBe('Cancel');

    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'An extra beat lands after the action.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert Typed Block' }));

    expect(onInsertAtAnchor).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining<ScriptAnchor>({
        kind: 'block',
        blockId: 'block-1',
        position: 'after',
        id: 'block:block-1:after'
      }),
      expect.objectContaining({
        text: 'An extra beat lands after the action.'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert near selected block' }));
    composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert Before' }));
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'A setup beat lands first.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert Typed Block' }));

    expect(onInsertAtAnchor).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining<ScriptAnchor>({
        kind: 'block',
        blockId: 'block-1',
        position: 'before',
        id: 'block:block-1:before'
      }),
      expect.objectContaining({
        text: 'A setup beat lands first.'
      })
    );
  });

  it('clears selected block actions when an inline insert slot becomes active', async () => {
    const { container } = render(<ScriptPane {...createProps()} />);

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('insert-slot-1'));

    await waitFor(() => {
      expect(screen.queryByTestId('selected-block-actions-block-1')).toBeNull();
    });
    expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
  });

  it('selects and edits a scene heading through the shared heading actions', async () => {
    const onUpdateSceneHeading = vi.fn();
    render(<ScriptPane {...createProps({ onUpdateSceneHeading })} />);

    const heading = screen.getByText('INT. ARCHIVE - NIGHT');
    expect(heading.className).toContain('font-extrabold');
    fireEvent.click(heading);
    expect(screen.getByTestId('selected-heading-actions-scene-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit selected scene heading' }));
    const editor = screen.getByRole('dialog', { name: 'Edit Scene Heading' });
    const input = within(editor).getByPlaceholderText('INT. LOCATION - DAY');
    fireEvent.change(input, { target: { value: 'INT. ARCHIVE STACKS - NIGHT' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save Heading' }));

    expect(onUpdateSceneHeading).toHaveBeenCalledWith('scene-1', 'INT. ARCHIVE STACKS - NIGHT');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit Scene Heading' })).toBeNull();
    });
  });

  it('supports inserting directly below an empty scene heading', () => {
    const onInsertAtAnchor = vi.fn();
    render(
      <ScriptPane
        {...createProps({
          context: contextWithEmptySecondScene,
          onInsertAtAnchor
        })}
      />
    );

    fireEvent.click(screen.getByText('EXT. WATERFRONT - DAWN'));
    fireEvent.click(screen.getByRole('button', { name: 'Insert after scene heading' }));

    const composer = screen.getByRole('dialog', { name: 'Insert Block' });
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'The shoreline wakes before anyone speaks.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Insert Typed Block' }));

    expect(onInsertAtAnchor).toHaveBeenCalledWith(
      expect.objectContaining<ScriptAnchor>({
        kind: 'scene',
        sceneId: 'scene-2',
        position: 'top',
        id: 'scene:scene-2:top'
      }),
      expect.objectContaining({
        text: 'The shoreline wakes before anyone speaks.'
      })
    );
  });

  it('rewrite composer generates preview and applies content for selected block', async () => {
    const onGenerateRewritePreview = vi.fn(async () => 'The ledger reveals a coded confession.');
    const onApplyRewritePreview = vi.fn();
    const { container } = render(
      <ScriptPane {...createProps({ onGenerateRewritePreview, onApplyRewritePreview })} />
    );

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    const composer = screen.getByRole('dialog', { name: 'Rewrite Block' });

    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'Shorten and add menace.' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Generate Rewrite' }));

    expect(screen.getByText('Generating...')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('The ledger reveals a coded confession.')).toBeTruthy();
    });
    expect(onGenerateRewritePreview).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      blockId: 'block-1',
      instructions: 'Shorten and add menace.'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyRewritePreview).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      blockId: 'block-1',
      text: 'The ledger reveals a coded confession.'
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rewrite Block' })).toBeNull();
    });
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();
  });

  it('routes rewrite tool regenerate through composer preview pipeline', async () => {
    const onGenerateRewritePreview = vi.fn(async () => 'The ledger snaps shut with intent.');
    render(<ScriptPane {...createProps({ onGenerateRewritePreview })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    fireEvent.change(screen.getByPlaceholderText('Tone, intent, constraints...'), {
      target: { value: 'Make it sharper.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => {
      expect(onGenerateRewritePreview).toHaveBeenCalledWith({
        sceneId: 'scene-1',
        blockId: 'block-1',
        instructions: 'Make it sharper.'
      });
    });
    expect(screen.getByRole('dialog', { name: 'Rewrite Block' })).toBeTruthy();
  });

  it('rewrite composer closes on cancel, escape, and outside click while keeping selection', async () => {
    const { container } = render(<ScriptPane {...createProps()} />);

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rewrite Block' })).toBeNull();
    });
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rewrite Block' })).toBeNull();
    });
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rewrite Block' })).toBeNull();
    });
    expect(screen.getByTestId('selected-block-actions-block-1')).toBeTruthy();
  });

  it('rewrite composer shows inline error on generation failure', async () => {
    const onGenerateRewritePreview = vi.fn(async () => {
      throw new Error('Rewrite failed');
    });
    const { container } = render(
      <ScriptPane {...createProps({ onGenerateRewritePreview })} />
    );

    const block = container.querySelector('#block-block-1') as HTMLElement;
    fireEvent.click(block);
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite selected block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate Rewrite' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Rewrite failed');
    });
  });

  it('disables inline rewrite for locked blocks and stubs delete when handler is missing', () => {
    const { container } = render(
      <ScriptPane {...createProps({ onDeleteBlock: undefined })} />
    );

    const lockedBlock = container.querySelector('#block-block-2') as HTMLElement;
    fireEvent.click(lockedBlock);

    const rewriteButton = screen.getByRole('button', { name: 'Rewrite selected block' }) as HTMLButtonElement;
    const deleteButton = screen.getByRole('button', { name: 'Delete selected block' }) as HTMLButtonElement;

    expect(rewriteButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
  });
});
