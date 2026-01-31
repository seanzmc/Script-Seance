import React, { useState, useEffect } from 'react';
import { VoiceConfig, AVAILABLE_VOICES } from '../types';
import { Volume2, Loader, Square, Settings2, ChevronDown, ChevronUp, Sliders } from 'lucide-react';

export interface VoiceManagerProps {
  characters: string[];
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
  voiceConfigs,
  onUpdateConfig,
  onOpenCasting,
  onPreview,
  onStop,
  isAudioPlaying,
  isLoading
}) => {
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
      voiceId: AVAILABLE_VOICES[0],
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
    const isActive = activeChar === char;
    const isThisLoading = isActive && isLoading;
    const isThisPlaying = isActive && isAudioPlaying;
    const isExpanded = expandedChars[char];
    const isNarrator = options?.variant === 'narrator';
    const isEvenRow = typeof options?.index === 'number' && options.index % 2 === 0;
    const rowTone = isNarrator
      ? 'border-indigo-500/30 bg-indigo-500/10'
      : isEvenRow
        ? 'border-gray-800/60 bg-gray-900/50'
        : 'border-gray-800/60 bg-gray-900/40';

    return (
      <div key={char} className="space-y-2">
        <div className={`grid grid-cols-[1.6fr_1fr_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 ${rowTone} ${
          isActive ? 'ring-1 ring-indigo-500/40' : ''
        }`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate" title={char}>{char}</p>
            <p className={`text-[11px] ${isNarrator ? 'text-indigo-200' : 'text-gray-400'}`}>
              Voice: <span className="text-gray-200">{config.voiceId}</span>
            </p>
          </div>
          <div className="text-[11px] text-gray-400">
            {config.speed?.toFixed(1) || '1.0'}x / Pitch {config.pitch || 0}
          </div>
          <button
            onClick={() => handlePreview(char, config)}
            className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 whitespace-nowrap ${
              (isThisLoading || isThisPlaying)
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-indigo-600'
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOpenCasting(char)}
              className="p-2 text-gray-400 hover:text-indigo-300 hover:bg-gray-800/70 rounded-md"
              title="Cast a different voice"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleExpand(char)}
              className={`p-2 text-gray-500 hover:text-gray-300 rounded-md ${isExpanded ? 'bg-gray-800/70' : ''}`}
              title="Adjust speed and pitch"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-800 bg-black/20 px-3 py-3">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Speed</label>
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
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Pitch</label>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Sliders className="w-4 h-4" />
          Character Voices
        </h4>
        {showSaved && (
          <span className="text-[10px] text-emerald-400 font-semibold">Saved</span>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500">
            <span>Narrator</span>
            <span className="text-gray-600">Voice lead</span>
          </div>
          {renderRow('Narrator', { variant: 'narrator' })}
        </div>

        <div className="h-px bg-gray-800/60" />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500">
            <span>Cast</span>
            <span className="text-gray-600">{characters.length} characters</span>
          </div>
          <div className="space-y-2">
            {characters.map((char, index) => renderRow(char, { variant: 'cast', index }))}
          </div>
        </div>
      </div>
    </div>
  );
};
