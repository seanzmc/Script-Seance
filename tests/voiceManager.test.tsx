import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { VoiceManager } from '../components/VoiceManager';
import { TtsVoice, VoiceConfig } from '../types';

afterEach(() => {
  cleanup();
});

describe('VoiceManager', () => {
  it('includes orphaned assigned voice even when missing from dynamic catalog', () => {
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
      { name: 'Hero', voiceId: 'orphaned-voice-42', speed: 1, pitch: 0 }
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

    expect(options).toContain('orphaned-voice-42');
    expect(options).toContain('Inworld Voice 1');
  });

  it('calls onOpenCasting immediately when Cast is clicked', () => {
    const onOpenCasting = vi.fn();
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
      { name: 'Hero', voiceId: 'inworld-voice-1', speed: 1, pitch: 0 }
    ];

    render(
      <VoiceManager
        characters={['Hero']}
        availableVoices={availableVoices}
        voiceConfigs={voiceConfigs}
        onUpdateConfig={vi.fn()}
        onOpenCasting={onOpenCasting}
        onPreview={vi.fn(async () => {})}
        onStop={vi.fn()}
        isAudioPlaying={false}
        isLoading={false}
      />
    );

    const heroName = screen.getByText('Hero');
    const heroRow = heroName.closest('.rounded-lg') as HTMLElement | null;
    if (!heroRow) {
      throw new Error('Hero row not found');
    }
    const castButton = within(heroRow).getByRole('button', { name: 'Cast' });
    expect(within(heroRow).getByRole('button', { name: 'Advanced' })).toBeTruthy();
    expect(within(heroRow).getByRole('button', { name: 'Preview' })).toBeTruthy();
    fireEvent.click(castButton);

    expect(onOpenCasting).toHaveBeenCalledTimes(1);
    expect(onOpenCasting).toHaveBeenCalledWith('Hero');
  });

  it('does not expose Hades in selectable voice options when it is absent from the catalog', () => {
    const availableVoices: TtsVoice[] = [
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
    ];
    const voiceConfigs: VoiceConfig[] = [
      { name: 'Narrator', voiceId: 'mark-voice', speed: 1, pitch: 0 },
      { name: 'Hero', voiceId: 'manual-only', speed: 1, pitch: 0 }
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

    expect(options).toContain('Manual Only');
    expect(options).not.toContain('Hades');
  });
});
