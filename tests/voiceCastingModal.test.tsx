import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VoiceCastingModal } from '../components/VoiceCastingModal';
import { VoiceConfig } from '../types';

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

    expect(scoped.getAllByText('Feminine')).toHaveLength(1);
    expect(scoped.getAllByText('High Energy')).toHaveLength(1);
    expect(scoped.getAllByText('Calm')).toHaveLength(1);
    expect(scoped.getByText('Mystery')).toBeTruthy();
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
});
