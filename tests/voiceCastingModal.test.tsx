import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VoiceCastingModal } from '../components/VoiceCastingModal';
import { VoiceConfig } from '../types';

describe('VoiceCastingModal', () => {
  it('shows casting semantics and back action in embedded mode', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'Zephyr', speed: 1, pitch: 0 }
    ];

    render(
      <VoiceCastingModal
        isOpen={true}
        embedded
        onClose={onClose}
        onBack={onBack}
        characterName="Narrator"
        currentVoiceId="Zephyr"
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
});
