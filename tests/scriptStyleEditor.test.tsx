import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftMode, type DraftModeProps } from '../components/workspace/DraftMode';
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

const createPaneProps = (
  context: StoryContext,
  onSaveStyle: (style: string) => void
): DraftModeProps => ({
  context,
  titleInputRef: createRef<HTMLInputElement>(),
  onTitleChange: vi.fn(),
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
  onChangeSpeaker: vi.fn(),
  onToggleLock: vi.fn(),
  isGenerating: false,
  isPlaying: false,
  onCancelGenerate: vi.fn(),
  currentBlockId: null,
  currentBlockIndex: -1,
  blockStatuses: {},
  showHighlights: true,
  autoScroll: false,
  onSaveStyle,
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
          <DraftMode {...createPaneProps(context, handleSaveStyle)} />
        </div>
      );
    };

    render(<Harness />);

    expect(screen.getByTestId('prompt-context-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: /edit style/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Unhinged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('prompt-context-revision').textContent).toBe('1');
    const draftMetaStrip = screen.getByText('Draft Workspace').closest('section');
    expect(draftMetaStrip).toBeTruthy();
    const editStyleButton = within(draftMetaStrip as HTMLElement).getByRole('button', { name: /edit style/i });
    const styleChip = editStyleButton.closest('span');
    expect(styleChip).toBeTruthy();
    expect(within(styleChip as HTMLElement).getByText('Unhinged')).toBeTruthy();

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

  it('keeps the visible draft composer available when the plot twist action runs', async () => {
    const onPlotTwist = vi.fn();
    const context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A detective uncovers a conspiracy.',
      characters: ['Alex', 'Sam'],
      style: 'Unhinged',
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
    };

    render(<DraftMode {...createPaneProps(context, vi.fn())} onPlotTwist={onPlotTwist} />);

    fireEvent.click(screen.getByRole('button', { name: /plot twist/i }));

    expect(onPlotTwist).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Draft Composer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue Writing' })).toBeTruthy();
  });

  it('opens the style library as the active top layer from style editing', () => {
    const context: StoryContext = {
      title: 'Draft',
      genre: 'Noir',
      premise: 'A detective uncovers a conspiracy.',
      characters: ['Alex', 'Sam'],
      style: 'Unhinged',
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
    };

    render(<DraftMode {...createPaneProps(context, vi.fn())} />);

    fireEvent.click(screen.getByRole('button', { name: /edit style/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse library' }));

    const dialog = screen.getByRole('dialog', { name: 'Style Library' });
    expect(dialog.parentElement?.className).toContain('z-[120]');
  });
});
