import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { VoiceManager } from '../components/VoiceManager';
import { TtsVoice, VoiceConfig } from '../types';

describe('VoiceManager', () => {
  it('includes legacy assigned voice even when missing from dynamic catalog', () => {
    const availableVoices: TtsVoice[] = [
      {
        id: 'inworld-voice-1',
        displayName: 'Inworld Voice 1',
        source: 'inworld-premade',
        labels: ['calm'],
        isCustom: false
      }
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 },
      { name: 'Hero', voiceId: 'legacy-voice-42', speed: 1, pitch: 0 }
    ];

    render(
      <VoiceManager
        characters={['Hero']}
        availableVoices={availableVoices}
        voiceConfigs={voiceConfigs}
        onUpdateConfig={vi.fn()}
        onOpenCasting={vi.fn()}
        onPreview={vi.fn(async () => {})}
        onStop={vi.fn()}
        isAudioPlaying={false}
        isLoading={false}
      />
    );

    const voiceSelectors = screen.getAllByRole('combobox');
    const heroSelector = voiceSelectors[1];
    const options = within(heroSelector).getAllByRole('option').map((option) => option.textContent);

    expect(options).toContain('legacy-voice-42');
    expect(options).toContain('Inworld Voice 1');
  });
});
