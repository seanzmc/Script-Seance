import React from 'react';
import { VoiceConfig } from '../types';
import { VoiceManager } from './VoiceManager';

interface VoicesPanelProps {
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
    <div className="space-y-4" onFocus={onReviewed} onClick={onReviewed}>
      <div className="space-y-1">
        <p className="text-[11px] text-gray-500">
          Map each character to a voice and preview the read. Defaults are assigned automatically.
        </p>
      </div>
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
