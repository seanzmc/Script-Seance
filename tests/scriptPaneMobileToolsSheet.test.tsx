import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptPane, type DraftCanvasChromeBridge, type ScriptPaneProps } from '../components/ScriptPane';
import { BlockType, StoryContext } from '../types';

const contextFixture: StoryContext = {
  title: 'Canvas Draft',
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

const createProps = (overrides: Partial<ScriptPaneProps> = {}): ScriptPaneProps => ({
  context: contextFixture,
  error: null,
  onGenerateNext: vi.fn(),
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
  insertScrollTargetId: null,
  insertScrollToken: 0,
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ScriptPane draft canvas surface', () => {
  it('renders the canvas without duplicated draft chrome', () => {
    render(<ScriptPane {...createProps()} />);

    expect(screen.queryByText('Draft Workspace')).toBeNull();
    expect(screen.queryByText('Draft Composer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue Writing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText('INT. OFFICE - NIGHT')).toBeTruthy();
    expect(screen.getByText('Alex studies the evidence board under flickering light.')).toBeTruthy();
  });

  it('registers a draft-end insert bridge without rendering extra toolbar controls', () => {
    const onChromeBridgeChange = vi.fn();
    render(<ScriptPane {...createProps({ onChromeBridgeChange })} />);

    const bridge = onChromeBridgeChange.mock.calls.at(-1)?.[0] as DraftCanvasChromeBridge | undefined;
    expect(bridge).toBeTruthy();
    expect(bridge?.canInsertSceneBeat).toBe(true);
  });

  it('opens the inline insert composer when the registered draft-end bridge is invoked', async () => {
    let registeredBridge: DraftCanvasChromeBridge | null = null;
    render(
      <ScriptPane
        {...createProps({
          onChromeBridgeChange: (bridge) => {
            registeredBridge = bridge;
          }
        })}
      />
    );

    registeredBridge?.openInsertSceneBeat();

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Insert Block' })).toBeTruthy();
    });
  });

  it('preserves inline heading editor layering above the canvas', () => {
    render(<ScriptPane {...createProps({ onUpdateSceneHeading: vi.fn() })} />);

    fireEvent.click(screen.getByText('INT. OFFICE - NIGHT'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected scene heading' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit Scene Heading' });
    expect(dialog.className).toContain('shadow');
  });
});
