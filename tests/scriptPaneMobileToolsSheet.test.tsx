import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { SetupFormState } from '../components/SetupForm';
import { PlaybackPanelProps } from '../components/PlaybackPanel';
import { BlockType, StoryContext } from '../types';

type MatchMediaListener = (event: MediaQueryListEvent) => void;
type LegacyMatchMediaListener = (this: MediaQueryList, ev: MediaQueryListEvent) => void;

interface MockMediaQueryList extends MediaQueryList {
  _listeners: Set<MatchMediaListener>;
  _legacyListeners: Set<LegacyMatchMediaListener>;
}

const createMatchMediaMock = () => {
  const originalMatchMedia = window.matchMedia;
  let currentWidth = 1280;
  const registry = new Map<string, MockMediaQueryList>();

  const evaluateQuery = (query: string) => {
    const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    if (maxWidthMatch) {
      return currentWidth <= Number(maxWidthMatch[1]);
    }
    return false;
  };

  const notifyListeners = (query: string, mediaQuery: MockMediaQueryList, nextMatches: boolean) => {
    if (mediaQuery.matches === nextMatches) return;
    (mediaQuery as unknown as { matches: boolean }).matches = nextMatches;
    const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
    mediaQuery.onchange?.call(mediaQuery, event);
    mediaQuery._listeners.forEach(listener => listener(event));
    mediaQuery._legacyListeners.forEach(listener => listener.call(mediaQuery, event));
  };

  const buildMediaQueryList = (query: string): MockMediaQueryList => ({
    media: query,
    matches: evaluateQuery(query),
    onchange: null,
    _listeners: new Set<MatchMediaListener>(),
    _legacyListeners: new Set<LegacyMatchMediaListener>(),
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change' || typeof listener !== 'function') return;
      const fn = listener as MatchMediaListener;
      const mediaQuery = registry.get(query);
      mediaQuery?._listeners.add(fn);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change' || typeof listener !== 'function') return;
      const fn = listener as MatchMediaListener;
      const mediaQuery = registry.get(query);
      mediaQuery?._listeners.delete(fn);
    },
    addListener: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      const mediaQuery = registry.get(query);
      mediaQuery?._legacyListeners.add(listener);
    },
    removeListener: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      const mediaQuery = registry.get(query);
      mediaQuery?._legacyListeners.delete(listener);
    },
    dispatchEvent: () => true
  } as MockMediaQueryList);

  window.matchMedia = vi.fn((query: string) => {
    const existing = registry.get(query);
    if (existing) return existing;
    const mediaQuery = buildMediaQueryList(query);
    registry.set(query, mediaQuery);
    return mediaQuery;
  });

  const setViewport = (width: number, height: number) => {
    currentWidth = width;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    registry.forEach((mediaQuery, query) => {
      notifyListeners(query, mediaQuery, evaluateQuery(query));
    });
  };

  const restore = () => {
    window.matchMedia = originalMatchMedia;
  };

  return { setViewport, restore };
};

const contextFixture: StoryContext = {
  title: 'Mobile Test Draft',
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

describe('ScriptPane mobile tools sheet regression coverage', () => {
  const matchMediaMock = createMatchMediaMock();

  beforeAll(() => {
    matchMediaMock.setViewport(390, 844);
  });

  beforeEach(() => {
    matchMediaMock.setViewport(390, 844);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterAll(() => {
    matchMediaMock.restore();
  });

  it('390x844: shows only dock initially, opens menu, then opens selected tool panel', async () => {
    render(<ScriptPane {...createProps()} />);

    expect(screen.queryByText('View Tools')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    expect(screen.getByTestId('mobile-tools-menu-sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(screen.getByTestId('mobile-tool-sheet-generate')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /generate next/i })).toBeTruthy();
  });

  it('390x844: insert tool restores after completion token while inline composer remains primary', async () => {
    const { rerender } = render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    await waitFor(() => {
      expect(screen.getByTestId('mobile-tool-sheet-insert')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    expect(screen.getByTestId('mobile-tools-menu-sheet')).toBeTruthy();

    rerender(<ScriptPane {...createProps({ insertCompleteToken: 1 })} />);
    await waitFor(() => {
      expect(screen.getByTestId('mobile-tool-sheet-insert')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });
  });

  it('430x932: rewrite opens in selection mode and restores tools after block select', async () => {
    matchMediaMock.setViewport(430, 932);
    const { container } = render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

    expect(screen.getByText(/select rewrite target/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close tool panel' })).toBeNull();

    const blockButton = container.querySelector('#block-b1') as HTMLElement;
    expect(blockButton).toBeTruthy();
    fireEvent.click(blockButton);

    await waitFor(() => {
      expect(screen.getByTestId('mobile-tool-sheet-rewrite')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });
  });

  it('390x844: playback controller is persistent and expands/collapses in place', async () => {
    render(<ScriptPane {...createProps()} />);

    expect(screen.getByTestId('playback-mini-player')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close playback mini-player' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close tool panel' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand playback details' }));

    await waitFor(() => {
      expect(screen.getByText('Refresh Audio')).toBeTruthy();
    });
    expect(screen.getByText('Less')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse playback details' }));

    await waitFor(() => {
      expect(screen.getByTestId('playback-mini-player')).toBeTruthy();
    });
    expect(screen.queryByText('Refresh Audio')).toBeNull();
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('setup screen ignores background clicks and closes only via explicit close button', () => {
    const onCloseSetup = vi.fn();
    render(<ScriptPane {...createProps({ isSetupOpen: true, onCloseSetup })} />);

    fireEvent.click(screen.getByTestId('setup-screen'));
    expect(onCloseSetup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    expect(onCloseSetup).toHaveBeenCalledTimes(1);
  });

  it('390x844: export opens from header menu and closes cleanly', async () => {
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

  it('1280x800: keeps floating playback and header export while legacy toolbelt excludes playback/export tools', async () => {
    matchMediaMock.setViewport(1280, 800);
    const onExportTxt = vi.fn();
    render(<ScriptPane {...createProps({ onExportTxt })} />);

    expect(screen.getByTestId('desktop-floating-playback')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voices' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open export menu' }));
    expect(await screen.findByRole('menu', { name: 'Export options' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export Script (.txt)' }));
    expect(onExportTxt).toHaveBeenCalledTimes(1);
  });
});
