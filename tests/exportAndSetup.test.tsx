import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScriptTextExport } from '../App';
import { SetupForm, SetupFormState } from '../components/SetupForm';
import { BlockType, Scene } from '../types';

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
          { id: 'b1', type: BlockType.ACTION, text: 'Rain hammers the window.' },
          { id: 'b2', type: BlockType.DIALOGUE, character: 'Alex', text: 'We are out of time.' },
          { id: 'b3', type: BlockType.HEADING, text: 'INT. SHOULD NOT DUPLICATE - DAY' }
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
});
