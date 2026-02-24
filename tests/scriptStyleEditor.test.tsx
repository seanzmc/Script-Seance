import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, ScriptPaneProps } from '../components/ScriptPane';
import { SetupFormState } from '../components/SetupForm';
import { PlaybackPanelProps } from '../components/PlaybackPanel';
import { BlockType, StoryContext } from '../types';
import { executeSuggestPlotTwist } from '../services/ai';

type MockResponse = {
  ok: boolean;
  status: number;
  headers: { get: (key: string) => string | null };
  text: () => Promise<string>;
};

const createMockResponse = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: vi.fn().mockResolvedValue(JSON.stringify(body))
});

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

const setupStateFixture: SetupFormState = {
  genre: 'Noir',
  premise: 'A detective uncovers a conspiracy.',
  characters: ['Alex', 'Sam'],
  style: '',
  length: 'Medium'
};

const createPaneProps = (
  context: StoryContext,
  onSaveStyle: (style: string) => void
): ScriptPaneProps => ({
  context,
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
  onSaveStyle,
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
  insertScrollToken: 0
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('script view style editor', () => {
  it('bumps prompt revision on save and uses updated style in next generation request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        data: { text: 'Twist!' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const Harness: React.FC = () => {
      const [context, setContext] = React.useState<StoryContext>({
        title: 'Draft',
        genre: 'Noir',
        premise: 'A detective uncovers a conspiracy.',
        characters: ['Alex', 'Sam'],
        style: '',
        scenes: [
          {
            id: 'scene-1',
            heading: 'INT. OFFICE - NIGHT',
            summary: 'Alex studies evidence.',
            blocks: [
              {
                id: 'block-1',
                type: BlockType.ACTION,
                text: 'Alex studies the evidence board.',
                blockRevision: 1
              }
            ]
          }
        ]
      });
      const [promptContextRevision, setPromptContextRevision] = React.useState(0);

      const applyContextMutation = React.useCallback((
        mutation: StoryContext | null | ((previous: StoryContext | null) => StoryContext | null)
      ) => {
        let didMutate = false;
        setContext((previous) => {
          const next = typeof mutation === 'function'
            ? (mutation as (previous: StoryContext | null) => StoryContext | null)(previous)
            : mutation;
          if (!next || next === previous) {
            return previous;
          }
          didMutate = true;
          return next;
        });
        if (didMutate) {
          setPromptContextRevision((previous) => previous + 1);
        }
        return didMutate;
      }, []);

      const handleSaveStyle = React.useCallback((nextStyle: string) => {
        const normalizedStyle = nextStyle.trim() ? nextStyle.trim() : undefined;
        applyContextMutation((prev) => {
          if (!prev) return prev;
          if (prev.style === normalizedStyle) return prev;
          return { ...prev, style: normalizedStyle };
        });
      }, [applyContextMutation]);

      const triggerTwist = () => {
        void executeSuggestPlotTwist(context.genre, context.style);
      };

      return (
        <div>
          <p data-testid="prompt-context-revision">{String(promptContextRevision)}</p>
          <button type="button" onClick={triggerTwist}>
            Trigger Twist Request
          </button>
          <ScriptPane {...createPaneProps(context, handleSaveStyle)} />
        </div>
      );
    };

    render(<Harness />);

    expect(screen.getByTestId('prompt-context-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: /edit style/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhinged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('prompt-context-revision').textContent).toBe('1');
    expect(screen.getByText('Unhinged')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Twist Request' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestBody.kind).toBe('suggestPlotTwist');
    expect(requestBody.context).toMatchObject({
      genre: 'Noir',
      style: 'Unhinged'
    });
  });
});
