import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScriptTextExport } from '../App';
import { SetupForm, SetupFormState } from '../components/SetupForm';
import { BlockType, Scene, StoryContext } from '../types';

afterEach(() => {
  cleanup();
});

describe('buildScriptTextExport', () => {
  it('includes scene headings even when no heading block exists', () => {
    const scenes: Scene[] = [
      {
        id: 'scene-1',
        heading: 'INT. APARTMENT - NIGHT',
        summary: 'A tense exchange',
        blocks: [
          { id: 'b1', type: BlockType.ACTION, text: 'Rain hammers the window.', blockRevision: 1 },
          { id: 'b2', type: BlockType.DIALOGUE, character: 'Alex', text: 'We are out of time.', blockRevision: 1 },
          { id: 'b3', type: BlockType.HEADING, text: 'INT. SHOULD NOT DUPLICATE - DAY', blockRevision: 1 }
        ]
      }
    ];

    const text = buildScriptTextExport(scenes);

    expect(text).toContain('INT. APARTMENT - NIGHT');
    expect(text).toContain('Rain hammers the window.');
    expect(text).toContain('ALEX');
    expect(text).not.toContain('INT. SHOULD NOT DUPLICATE - DAY');
  });
});

describe('SetupForm submit validation', () => {
  const baseValue: SetupFormState = {
    genre: 'Noir',
    premise: 'A detective uncovers a conspiracy.',
    characters: ['Hero', 'Villain'],
    style: '',
    length: 'Medium'
  };

  it('disables generate when all character names are blank', () => {
    render(
      <SetupForm
        value={{ ...baseValue, characters: ['   ', ''] }}
        onChange={vi.fn()}
        onStart={vi.fn()}
        isLoading={false}
        showSubmit
      />
    );

    const button = screen.getByRole('button', { name: /generate first scene/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables generate when there is at least one non-empty character', () => {
    render(
      <SetupForm
        value={{ ...baseValue, characters: ['   ', 'Lead'] }}
        onChange={vi.fn()}
        onStart={vi.fn()}
        isLoading={false}
        showSubmit
      />
    );

    const button = screen.getByRole('button', { name: /generate first scene/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('preset click updates shared context style and bumps prompt revision synchronously', () => {
    const StylePresetHarness: React.FC = () => {
      const [context, setContext] = React.useState<StoryContext | null>({
        title: 'Draft',
        genre: 'Noir',
        premise: 'A detective uncovers a conspiracy.',
        characters: ['Hero', 'Villain'],
        scenes: [],
        style: ''
      });
      const [setupState, setSetupState] = React.useState<SetupFormState>(baseValue);
      const promptContextRevisionRef = React.useRef(0);
      const contextRef = React.useRef<StoryContext | null>(context);
      const setupStateRef = React.useRef<SetupFormState>(setupState);

      React.useEffect(() => {
        contextRef.current = context;
      }, [context]);

      React.useEffect(() => {
        setupStateRef.current = setupState;
      }, [setupState]);

      const applyContextMutation = React.useCallback((
        mutation: StoryContext | null | ((previous: StoryContext | null) => StoryContext | null)
      ) => {
        const previous = contextRef.current;
        const next = typeof mutation === 'function'
          ? (mutation as (previous: StoryContext | null) => StoryContext | null)(previous)
          : mutation;
        if (next === previous) {
          return false;
        }
        contextRef.current = next;
        promptContextRevisionRef.current += 1;
        setContext(next);
        return true;
      }, []);

      const applySetupStateMutation = React.useCallback((
        mutation: SetupFormState | ((previous: SetupFormState) => SetupFormState),
        options?: { bumpPromptRevision?: boolean }
      ) => {
        const previous = setupStateRef.current;
        const next = typeof mutation === 'function'
          ? (mutation as (previous: SetupFormState) => SetupFormState)(previous)
          : mutation;
        if (next === previous) {
          return false;
        }
        setupStateRef.current = next;
        if (options?.bumpPromptRevision ?? true) {
          promptContextRevisionRef.current += 1;
        }
        setSetupState(next);
        return true;
      }, []);

      const onSetupChange = React.useCallback((next: Partial<SetupFormState>) => {
        const hasStyle = Object.prototype.hasOwnProperty.call(next, 'style');
        if (hasStyle && contextRef.current) {
          const rawStyle = typeof next.style === 'string' ? next.style : '';
          const normalizedStyle = rawStyle.trim() ? rawStyle.trim() : undefined;
          const didMutateContext = applyContextMutation((prev) => {
            if (!prev) return prev;
            if (prev.style === normalizedStyle) {
              return prev;
            }
            return { ...prev, style: normalizedStyle };
          });
          applySetupStateMutation((prev) => ({ ...prev, ...next }), {
            bumpPromptRevision: !didMutateContext
          });
          return;
        }
        applySetupStateMutation((prev) => ({ ...prev, ...next }));
      }, [applyContextMutation, applySetupStateMutation]);

      return (
        <div>
          <p data-testid="context-style">{context?.style || ''}</p>
          <p data-testid="prompt-revision">{String(promptContextRevisionRef.current)}</p>
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            isLoading={false}
          />
        </div>
      );
    };

    render(<StylePresetHarness />);
    expect(screen.getByTestId('context-style').textContent).toBe('');
    expect(screen.getByTestId('prompt-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'Unhinged' }));

    expect(screen.getByTestId('context-style').textContent).toBe('Unhinged');
    expect(screen.getByTestId('prompt-revision').textContent).toBe('1');
  });
});
