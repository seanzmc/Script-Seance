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
          text: 'Alex studies the evidence board under flickering light.'
        },
        {
          id: 'b2',
          type: BlockType.DIALOGUE,
          character: 'Alex',
          text: 'Something here does not add up.'
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
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });
  });

  it('390x844: insert pick mode collapses tools and restores tool panel after completion token', async () => {
    const { rerender } = render(<ScriptPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });

    rerender(<ScriptPane {...createProps({ insertModeActive: true, insertCompleteToken: 0 })} />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close tool panel' })).toBeNull();
    });

    rerender(<ScriptPane {...createProps({ insertModeActive: false, insertCompleteToken: 1 })} />);
    await waitFor(() => {
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
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });
  });

  it('390x844: playback opens mini-player, expands to details, collapses back, and close stops playback', async () => {
    const onStop = vi.fn();
    render(<ScriptPane {...createProps({ playbackProps: createPlaybackProps({ onStop }) })} />);

    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Playback' }));

    await waitFor(() => {
      expect(screen.getByTestId('playback-mini-player')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Close tool panel' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open playback details' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close tool panel' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close tool panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('playback-mini-player')).toBeTruthy();
    });
    expect(onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close playback mini-player' }));

    await waitFor(() => {
      expect(screen.queryByTestId('playback-mini-player')).toBeNull();
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
