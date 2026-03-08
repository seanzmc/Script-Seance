import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { SetupFormState } from '../components/SetupForm';
import { PlaybackPanelProps } from '../components/PlaybackPanel';
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

const setupStateFixture: SetupFormState = {
  genre: 'Noir',
  premise: 'A detective uncovers a conspiracy.',
  characters: ['Alex', 'Sam'],
  style: '',
  length: 'Medium'
};

const createPlaybackProps = (overrides: Partial<PlaybackPanelProps> = {}): PlaybackPanelProps => ({
  isPlaying: false,
  isPaused: false,
  isLoadingAudio: false,
  currentBlockId: null,
  currentBlockIndex: -1,
  blockStatuses: {},
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onStop: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRetry: vi.fn(),
  onSkip: vi.fn(),
  onRefreshAudio: vi.fn(),
  onPurgeAudio: vi.fn(),
  bufferedCount: 0,
  totalCount: 0,
  currentSpeaker: 'None',
  playbackSpeed: 1,
  onPlaybackSpeedChange: vi.fn(),
  showHighlights: true,
  onToggleHighlights: vi.fn(),
  autoScroll: false,
  onToggleAutoScroll: vi.fn(),
  ...overrides
});

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
  playbackProps: createPlaybackProps(),
  voicesContent: <div>Voices panel body</div>,
  insertScrollTargetId: null,
  insertScrollToken: 0,
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ScriptPane header generation and audio drawer', () => {
  it('opens the header generate dropdown with prompt and generation actions', async () => {
    const onPlotTwist = vi.fn();
    render(<ScriptPane {...createProps({ onPlotTwist })} />);

    expect(screen.queryByRole('button', { name: 'Tools' })).toBeNull();
    expect(screen.queryByTestId('playback-mini-player')).toBeNull();
    expect(screen.queryByTestId('desktop-floating-playback')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open generate menu' }));

    const generateMenu = await screen.findByRole('dialog', { name: 'Generate menu' });
    expect(generateMenu).toBeTruthy();
    expect(generateMenu.className).toContain('max-[1100px]:left-0');
    expect(screen.getByRole('button', { name: /generate \/ continue writing/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /plot twist/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /insert scene \/ new beat/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /plot twist/i }));
    expect(onPlotTwist).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Generate menu' })).toBeTruthy();
  });

  it('opens the inline insert composer from the Generate menu scene action', async () => {
    render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open generate menu' }));
    fireEvent.click(await screen.findByRole('button', { name: /insert scene \/ new beat/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
    });
    expect(screen.queryByRole('dialog', { name: 'Generate menu' })).toBeNull();
  });

  it('opens the audio drawer and removes persistent playback chrome', async () => {
    render(<ScriptPane {...createProps()} />);

    expect(screen.queryByTestId('playback-mini-player')).toBeNull();
    expect(screen.queryByTestId('desktop-floating-playback')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open audio drawer' }));

    const drawer = await screen.findByTestId('audio-drawer');
    expect(drawer).toBeTruthy();
    expect(screen.getByText('Playback and Voice Utility')).toBeTruthy();
    expect(screen.getByText('Voices panel body')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close audio drawer' }));
    await waitFor(() => {
      expect(screen.queryByTestId('audio-drawer')).toBeNull();
    });
  });

  it('formats title metadata and uses matching title/style edit link styling', () => {
    const { container } = render(<ScriptPane {...createProps({ onSaveStyle: vi.fn() })} />);

    const editTitleButton = screen.getByRole('button', { name: 'Edit Title' });
    const editStyleButton = screen.getByRole('button', { name: /Edit Style/i });
    const generateButton = screen.getByRole('button', { name: 'Open generate menu' });
    const audioButton = screen.getByRole('button', { name: 'Open audio drawer' });
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    const metadataRow = screen.getByText('Genre:').closest('div') as HTMLElement;

    expect(editTitleButton.className).toBe(editStyleButton.className);
    expect(screen.queryByText('1 scenes')).toBeNull();
    expect(screen.getByText('Genre:')).toBeTruthy();
    expect(screen.getByText('Style:')).toBeTruthy();
    expect(screen.queryByText('Draft autosaves locally.')).toBeNull();
    expect(screen.queryByLabelText('Draft saves locally')).toBeNull();
    expect(metadataRow.textContent).toContain('Genre:');
    expect(metadataRow.textContent).toContain('Style:');
    expect(metadataRow.textContent).not.toContain('1 scenes');
    expect(generateButton.className).toContain('sm:h-12');
    expect(generateButton.className).toContain('max-[940px]:w-10');
    expect(audioButton.className).toContain('sm:h-12');
    expect(audioButton.className).toContain('max-[940px]:w-10');
    expect(undoButton.className).toContain('h-9');
    expect(undoButton.className).toContain('max-[940px]:h-10');
    expect(generateButton.parentElement?.parentElement?.parentElement?.className).toContain('w-full');
    expect(generateButton.parentElement?.parentElement?.parentElement?.className).toContain('xl:flex-col');
    expect(generateButton.parentElement?.parentElement?.parentElement?.className).toContain('xl:items-end');
    expect(generateButton.parentElement?.parentElement?.className).toContain('max-[940px]:contents');
    expect(generateButton.parentElement?.parentElement?.className).not.toContain('flex-wrap');
    expect(generateButton.parentElement?.parentElement?.parentElement?.className).toContain('max-[940px]:justify-center');
    expect(container.textContent).toContain('•');

    fireEvent.click(generateButton);
    const generateMenu = screen.getByRole('dialog', { name: 'Generate menu' });

    expect(within(generateMenu).getByText('1 scenes')).toBeTruthy();
    expect(within(generateMenu).getByLabelText('Draft saves locally')).toBeTruthy();
    expect(within(generateMenu).getByText('Draft saves locally')).toBeTruthy();
    expect(within(generateMenu).getByRole('button', { name: 'Privacy' })).toBeTruthy();
  });

  it('anchors the header writing pill outside the action-row flex flow', () => {
    render(<ScriptPane {...createProps({ isGenerating: true })} />);

    const writingLabel = screen.getByText('Writing');
    const writingPill = writingLabel.closest('[aria-live="polite"]') as HTMLElement;
    expect(writingPill.className).toContain('pointer-events-auto');
    expect(writingPill.parentElement?.className).toContain('absolute');
    expect(writingPill.parentElement?.className).toContain('top-full');
    expect(writingPill.parentElement?.className).toContain('max-[940px]:left-1/2');
  });

  it('toggles title and style editors closed when their active triggers are clicked again', async () => {
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

  it('positions the style editor within the viewport shell above the header band', () => {
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

  it('shows plot twist progress without shifting the generate button into loading mode', () => {
    render(<ScriptPane {...createProps({ isGenerating: true })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open generate menu' }));

    expect(screen.getByText('Working on your request...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate \/ continue writing/i }).getAttribute('aria-busy')).toBeNull();
  });

  it('setup screen ignores background clicks and closes only via explicit close button', () => {
    const onCloseSetup = vi.fn();
    render(<ScriptPane {...createProps({ isSetupOpen: true, onCloseSetup })} />);

    fireEvent.click(screen.getByTestId('setup-screen'));
    expect(onCloseSetup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    expect(onCloseSetup).toHaveBeenCalledTimes(1);
  });

  it('export opens from the header menu and closes cleanly', async () => {
    const onExportTxt = vi.fn();
    const onExportPdf = vi.fn();
    render(<ScriptPane {...createProps({ onExportTxt, onExportPdf })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open export menu' }));

    const exportMenu = await screen.findByRole('menu', { name: 'Export options' });
    expect(exportMenu).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export Script (.txt)' }));
    expect(onExportTxt).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open export menu' }));
    expect(await screen.findByRole('menu', { name: 'Export options' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export PDF' }));
    expect(onExportPdf).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('menu', { name: 'Export options' })).toBeNull();
  });
});
