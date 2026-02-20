import React, { useState, useEffect } from 'react';
import { VoiceConfig, TtsVoice, LEGACY_VOICE_IDS, DEFAULT_NARRATOR_VOICE_ID } from '../types';
import { Volume2, Loader, Square, List, ChevronDown } from 'lucide-react';

export interface VoiceManagerProps {
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

export const VoiceManager: React.FC<VoiceManagerProps> = ({
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
  const availableVoiceIds = availableVoices.map((voice) => voice.id);
  const fallbackVoiceIds = availableVoiceIds.length > 0 ? availableVoiceIds : LEGACY_VOICE_IDS;

  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [expandedChars, setExpandedChars] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAudioPlaying && !isLoading) {
      setActiveChar(null);
    }
  }, [isAudioPlaying, isLoading]);

  useEffect(() => {
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [voiceConfigs]);

  const toggleExpand = (char: string) => {
    setExpandedChars(prev => ({ ...prev, [char]: !prev[char] }));
  };

  const getConfig = (char: string): VoiceConfig => {
    return voiceConfigs.find(c => c.name === char) || {
      name: char,
      voiceId: fallbackVoiceIds[0] || DEFAULT_NARRATOR_VOICE_ID,
      speed: 1,
      pitch: 0
    };
  };

  const handlePreview = async (char: string, config: VoiceConfig) => {
    if (activeChar === char && (isAudioPlaying || isLoading)) {
      onStop();
      return;
    }
    setActiveChar(char);
    await onPreview(config);
  };

  const renderRow = (char: string, options?: { variant?: 'narrator' | 'cast'; index?: number }) => {
    const config = getConfig(char);
    const voiceOptions = config.voiceId && !fallbackVoiceIds.includes(config.voiceId)
      ? [config.voiceId, ...fallbackVoiceIds]
      : fallbackVoiceIds;
    const hasDynamicCatalog = availableVoices.length > 0;
    const isActive = activeChar === char;
    const isThisLoading = isActive && isLoading;
    const isThisPlaying = isActive && isAudioPlaying;
    const isExpanded = expandedChars[char];
    const advancedControlsId = `voice-advanced-${char.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const isNarrator = options?.variant === 'narrator';
    const isEvenRow = typeof options?.index === 'number' && options.index % 2 === 0;
    const rowTone = isNarrator
      ? 'border-indigo-500/25 bg-indigo-500/10'
      : isEvenRow
        ? 'border-gray-800 bg-gray-950/55'
        : 'border-gray-800 bg-gray-950/45';

    return (
      <div key={char} className="space-y-1.5">
        <div className={`space-y-2 rounded-lg border px-2.5 py-2 ${rowTone} ${isActive ? 'ring-1 ring-indigo-500/40' : ''}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate" title={char}>{char}</p>
            {isNarrator && (
              <span className="text-[9px] uppercase tracking-widest text-indigo-200">Narrator</span>
            )}
          </div>

          <select
            value={config.voiceId}
            onChange={(e) => onUpdateConfig(char, { voiceId: e.target.value })}
            className="min-w-0 w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-2.5 py-2 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none"
          >
            {voiceOptions.map(voice => (
              <option key={voice} value={voice}>
                {hasDynamicCatalog
                  ? (availableVoices.find((entry) => entry.id === voice)?.displayName || voice)
                  : voice}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => onOpenCasting(char)}
              aria-label="Cast"
              className="px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap border-transparent text-gray-400 hover:text-indigo-200 hover:border-gray-700 hover:bg-gray-800/60"
              title="Cast"
            >
              <List className="w-3.5 h-3.5" />
              <span>Cast</span>
            </button>
            <button
              onClick={() => toggleExpand(char)}
              aria-label="Advanced"
              aria-expanded={isExpanded}
              aria-controls={advancedControlsId}
              className={`px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                isExpanded
                  ? 'bg-gray-800/70 border-gray-700 text-indigo-200'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700 hover:bg-gray-800/60'
              }`}
              title="Toggle advanced voice controls"
            >
              <span>Advanced</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => handlePreview(char, config)}
              className={`px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap ${
                (isThisLoading || isThisPlaying)
                  ? 'bg-red-600/85 border-red-500 text-white'
                  : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:text-white hover:border-indigo-500/70 hover:bg-indigo-600/70'
              }`}
              title={isThisPlaying ? 'Stop preview' : 'Preview voice'}
            >
              {isThisLoading ? (
                <Loader className="w-3.5 h-3.5 animate-spin" />
              ) : isThisPlaying ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isThisPlaying ? 'Stop' : 'Preview'}</span>
            </button>
          </div>

          {isExpanded && (
            <div
              id={advancedControlsId}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-gray-800 bg-gray-900/35 px-2.5 py-2"
            >
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Speed</label>
                  <span className="text-[10px] text-gray-300 bg-gray-700 px-1 rounded">{config.speed?.toFixed(1) || '1.0'}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={config.speed || 1}
                  onChange={(e) => onUpdateConfig(char, { speed: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Pitch</label>
                  <span className="text-[10px] text-gray-300 bg-gray-700 px-1 rounded">{config.pitch || 0}</span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="1"
                  value={config.pitch || 0}
                  onChange={(e) => onUpdateConfig(char, { pitch: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <label className="col-span-2 flex items-center justify-between rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1.5 text-[10px] uppercase tracking-widest text-gray-400">
                <span>Expressive TTS</span>
                <input
                  type="checkbox"
                  checked={config.expressive || false}
                  onChange={(e) => onUpdateConfig(char, { expressive: e.target.checked })}
                  className="h-3.5 w-3.5 accent-indigo-500"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ASSIGNMENTS</h4>
        {showSaved && (
          <span className="text-[10px] text-emerald-400 font-semibold">Saved</span>
        )}
      </div>

      <div className="space-y-3 pb-1">
        {renderRow('Narrator', { variant: 'narrator' })}

        {characters.map((char, index) => renderRow(char, { variant: 'cast', index }))}
      </div>
    </div>
  );
};
