import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { VoiceCastingModal } from '../components/VoiceCastingModal';
import { VoiceConfig } from '../types';

afterEach(() => {
  cleanup();
});

describe('VoiceCastingModal', () => {
  it('shows casting semantics and back action in embedded mode', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    render(
      <VoiceCastingModal
        isOpen={true}
        embedded
        onClose={onClose}
        onBack={onBack}
        characterName="Narrator"
        currentVoiceId="inworld-voice-1"
        availableVoices={[]}
        voiceConfigs={voiceConfigs}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByText('CAST VOICES')).toBeTruthy();
    expect(screen.getByText('Assign a voice to your character.')).toBeTruthy();
    expect(screen.getByText(/Casting:/)).toBeTruthy();
    expect(screen.getByText('Narrator')).toBeTruthy();
    expect(screen.queryByLabelText('Close voice casting')).toBeNull();

    const backButton = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deduplicates extra trait chips against canonical badges', () => {
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'test-voice', speed: 1, pitch: 0 }
    ];

    render(
      <VoiceCastingModal
        isOpen={true}
        embedded
        onClose={vi.fn()}
        onBack={vi.fn()}
        characterName="Narrator"
        currentVoiceId="test-voice"
        availableVoices={[
          {
            id: 'test-voice',
            displayName: 'Test Voice',
            source: 'inworld-premade',
            labels: ['feminine', 'high-energy', 'calm'],
            tags: ['HIGH ENERGY', 'feminine', ' calm ', 'Calm', 'mystery'],
            isCustom: false,
            gender: 'Feminine',
            category: 'High Energy'
          }
        ]}
        voiceConfigs={voiceConfigs}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
      />
    );

    const card = screen.getByText('Test Voice').closest('.group');
    if (!card) {
      throw new Error('Voice card not found');
    }
    const scoped = within(card as HTMLElement);
    const grid = screen.getByTestId('voice-casting-grid');
    const canonicalBadges = screen.getByTestId('voice-card-canonical-badges-test-voice');

    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('min-[360px]:grid-cols-2');
    expect(grid.className).not.toContain('lg:grid-cols-3');
    expect(canonicalBadges.className).toContain('flex-wrap');
    expect(scoped.getAllByText('Feminine')).toHaveLength(1);
    expect(scoped.getAllByText('High Energy')).toHaveLength(1);
    expect(scoped.getAllByText('Calm')).toHaveLength(1);
    expect(scoped.getByText('Mystery')).toBeTruthy();
  });

  it('preserves the wider non-embedded modal grid progression', () => {
    render(
      <VoiceCastingModal
        isOpen={true}
        onClose={vi.fn()}
        characterName="Narrator"
        currentVoiceId="test-voice"
        availableVoices={[
          {
            id: 'test-voice',
            displayName: 'Test Voice',
            source: 'inworld-premade',
            labels: ['calm'],
            isCustom: false
          }
        ]}
        voiceConfigs={[{ name: 'Narrator', voiceId: 'test-voice', speed: 1, pitch: 0 }]}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByTestId('voice-casting-grid').className).toContain('lg:grid-cols-3');
  });

  it('shows synthetic assigned voice when current voice is missing from provider catalog', () => {
    render(
      <VoiceCastingModal
        isOpen={true}
        embedded
        onClose={vi.fn()}
        onBack={vi.fn()}
        characterName="Narrator"
        currentVoiceId="orphaned-voice-42"
        availableVoices={[]}
        voiceConfigs={[{ name: 'Narrator', voiceId: 'orphaned-voice-42', speed: 1, pitch: 0 }]}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
      />
    );

    const orphanCard = screen.getByText('orphaned-voice-42').closest('.group');
    if (!orphanCard) {
      throw new Error('Orphaned voice card not found');
    }
    const scoped = within(orphanCard as HTMLElement);
    expect(scoped.getByText('Voice assigned in draft but missing from active provider catalog.')).toBeTruthy();
  });

  it('keeps manually selectable voices visible even when they are not auto-assignable, without surfacing Hades', () => {
    render(
      <VoiceCastingModal
        isOpen={true}
        embedded
        onClose={vi.fn()}
        onBack={vi.fn()}
        characterName="Hero"
        currentVoiceId="manual-only"
        availableVoices={[
          {
            id: 'mark-voice',
            displayName: 'Mark',
            source: 'inworld-premade',
            labels: ['narrator', 'professional'],
            isCustom: false,
            autoAssignable: true
          },
          {
            id: 'manual-only',
            displayName: 'Manual Only',
            source: 'inworld-premade',
            labels: ['calm'],
            isCustom: false,
            autoAssignable: false
          }
        ]}
        voiceConfigs={[{ name: 'Hero', voiceId: 'manual-only', speed: 1, pitch: 0 }]}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByText('Manual Only')).toBeTruthy();
    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.queryByText('Hades')).toBeNull();
  });
});
