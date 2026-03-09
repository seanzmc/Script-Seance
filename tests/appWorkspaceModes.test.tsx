import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { BlockType, StoryContext } from '../types';

const draftContext: StoryContext = {
  title: 'Workspace Draft',
  genre: 'Noir',
  premise: 'A detective follows a voice from the radio.',
  characters: ['Alex', 'Sam'],
  style: 'Unhinged',
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. OFFICE - NIGHT',
      summary: 'Alex studies the signal pattern.',
      blocks: [
        {
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex circles frequencies across a cluttered desk.',
          blockRevision: 1
        },
        {
          id: 'block-2',
          type: BlockType.DIALOGUE,
          character: 'Alex',
          text: 'The signal is trying to say something.',
          blockRevision: 1
        }
      ]
    }
  ]
};

const audioPlayerState = {
  isPlaying: false,
  isPaused: false,
  isPreviewPlaying: false,
  currentBlockId: null as string | null,
  currentBlockIndex: -1,
  isLoadingAudio: false,
  bufferedCount: 0,
  totalBufferedCount: 0,
  blockStatuses: {} as Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>,
  playScript: vi.fn(),
  clearGeneratedAudio: vi.fn(),
  playPreview: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  goToNext: vi.fn(),
  goToPrevious: vi.fn(),
  retryCurrentBlock: vi.fn(),
  skipCurrentBlock: vi.fn()
};

vi.mock('../services/auth', () => ({
  getSession: vi.fn(async () => true),
  login: vi.fn(async () => undefined)
}));

vi.mock('../services/ai', async () => {
  const actual = await vi.importActual<typeof import('../services/ai')>('../services/ai');
  return {
    ...actual,
    listVoices: vi.fn(async () => []),
    executeGenerateScene: vi.fn(),
    executeSuggestPlotTwist: vi.fn(),
    executeGenerateScriptElement: vi.fn(),
    executeGenerateSurpriseSetup: vi.fn()
  };
});

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(() => audioPlayerState)
}));

const DRAFT_STORAGE_KEY = 'script-seance:draft:v1';

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    })
  };
};

const seedDraft = () => {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    context: draftContext,
    userInstruction: 'Continue the investigation.',
    savedAt: new Date('2026-03-09T00:00:00.000Z').toISOString()
  }));
};

describe('App workspace modes', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true
    });
    window.localStorage.clear();
    Object.assign(audioPlayerState, {
      isPlaying: false,
      isPaused: false,
      isPreviewPlaying: false,
      currentBlockId: null,
      currentBlockIndex: -1,
      isLoadingAudio: false,
      bufferedCount: 0,
      totalBufferedCount: 0,
      blockStatuses: {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lands in setup mode when no draft is available', async () => {
    render(<App />);

    expect(await screen.findByText('Setup Workspace')).toBeTruthy();
    expect(screen.getByText('Start a new script')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Setup' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('lands in draft mode when a saved draft exists', async () => {
    seedDraft();

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Continue Writing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Draft' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText('Workspace Draft')).toHaveLength(2);
  });

  it('switches between draft, cast, and play modes without dropping the draft', async () => {
    seedDraft();

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Continue Writing' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));
    expect(await screen.findByText('Voice Casting')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('Playback Studio')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(await screen.findByRole('button', { name: 'Continue Writing' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('insert-slot-1'));
    expect(await screen.findByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
  });

  it('keeps the mini-player visible across non-play modes and hides it in play mode', async () => {
    seedDraft();
    Object.assign(audioPlayerState, {
      isPaused: true,
      currentBlockId: 'block-2',
      currentBlockIndex: 1,
      totalBufferedCount: 3
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Continue Writing' })).toBeTruthy();
    expect(screen.getByTestId('playback-mini-player')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cast' }));
    expect(await screen.findByText('Voice Casting')).toBeTruthy();
    expect(screen.getByTestId('playback-mini-player')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('Playback Studio')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId('playback-mini-player')).toBeNull();
    });
  });
});
