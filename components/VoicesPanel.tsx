import React from 'react';
import { VoiceConfig } from '../types';
import { VoiceManager } from './VoiceManager';

export interface VoicesPanelProps {
  characters: string[];
  voiceConfigs: VoiceConfig[];
  onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void;
  onOpenCasting: (character: string) => void;
  onPreview: (config: VoiceConfig) => Promise<void>;
  onStop: () => void;
  isAudioPlaying: boolean;
  isLoading: boolean;
  onReviewed?: () => void;
}

export const VoicesPanel: React.FC<VoicesPanelProps> = ({
  characters,
  voiceConfigs,
  onUpdateConfig,
  onOpenCasting,
  onPreview,
  onStop,
  isAudioPlaying,
  isLoading,
  onReviewed
}) => {
  return (
    <div className="space-y-2" onFocus={onReviewed} onClick={onReviewed}>
      <p className="text-[10px] text-gray-500">
        Assign voices and preview reads. Defaults are auto-assigned.
      </p>
      <VoiceManager
        characters={characters}
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
