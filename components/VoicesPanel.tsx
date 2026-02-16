import React from 'react';
import { VoiceConfig, TtsVoice } from '../types';
import { VoiceManager } from './VoiceManager';

export interface VoicesPanelProps {
  characters: string[];
  availableVoices: TtsVoice[];
  voiceConfigs: VoiceConfig[];
  onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void;
  onOpenCasting: (character: string) => void;
  onPreview: (config: VoiceConfig) => Promise<void>;
  onStop: () => void;
  isAudioPlaying: boolean;
  isLoading: boolean;
}

export const VoicesPanel: React.FC<VoicesPanelProps> = ({
  characters,
  availableVoices,
  voiceConfigs,
  onUpdateConfig,
  onOpenCasting,
  onPreview,
  onStop,
  isAudioPlaying,
  isLoading
}) => {
  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Voice Casting</p>
      <p className="text-[10px] text-gray-500">
        Assign voices and preview reads. Defaults are auto-assigned.
      </p>
      <VoiceManager
        characters={characters}
        availableVoices={availableVoices}
        voiceConfigs={voiceConfigs}
        onUpdateConfig={onUpdateConfig}
        onOpenCasting={onOpenCasting}
        onPreview={onPreview}
        onStop={onStop}
        isAudioPlaying={isAudioPlaying}
        isLoading={isLoading}
      />
    </div>
  );
};
