import React, { useState, useEffect } from 'react';
import { VoiceConfig, AVAILABLE_VOICES } from '../types';
import { Mic, Volume2, Loader, Square, CheckCircle2 } from 'lucide-react';

interface VoiceManagerProps {
  characters: string[];
  voiceConfigs: VoiceConfig[];
  onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void;
  onPreview: (config: VoiceConfig) => Promise<void>;
  onStop: () => void;
  isAudioPlaying: boolean;
  isLoading: boolean;
}

export const VoiceManager: React.FC<VoiceManagerProps> = ({ 
  characters, 
  voiceConfigs, 
  onUpdateConfig,
  onPreview,
  onStop,
  isAudioPlaying,
  isLoading
}) => {
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  // Clear active char when playback stops
  useEffect(() => {
    if (!isAudioPlaying && !isLoading) {
      setActiveChar(null);
    }
  }, [isAudioPlaying, isLoading]);

  // Show "Saved" feedback on config change
  useEffect(() => {
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [voiceConfigs]);

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

  const renderControlRow = (char: string) => {
    const config = getConfig(char);
    const isActive = activeChar === char;
    const isThisLoading = isActive && isLoading;
    const isThisPlaying = isActive && isAudioPlaying;
    
    return (
      <div key={char} className={`bg-gray-800 rounded-lg p-3 border transition-colors ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-gray-700'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white font-medium truncate max-w-[100px]" title={char}>
            {char}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={config.voiceId}
              onChange={(e) => onUpdateConfig(char, { voiceId: e.target.value })}
              className="bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 min-w-[80px]"
            >
              {AVAILABLE_VOICES.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button
              onClick={() => handlePreview(char, config)}
              className={`p-1.5 rounded-md transition-colors ${
                (isThisLoading || isThisPlaying) 
                  ? 'text-white bg-red-600 hover:bg-red-700' 
                  : 'text-indigo-400 hover:bg-gray-700'
              }`}
              title={isThisPlaying ? "Stop Preview" : "Preview Voice"}
            >
              {isThisLoading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : isThisPlaying ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Speed Control */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">Speed</label>
              <span className="text-[10px] text-gray-300">{config.speed?.toFixed(1) || '1.0'}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={config.speed || 1}
              onChange={(e) => onUpdateConfig(char, { speed: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Pitch Control */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">Pitch</label>
              <span className="text-[10px] text-gray-300">{config.pitch || '0'}</span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={config.pitch || 0}
              onChange={(e) => onUpdateConfig(char, { pitch: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 relative">
      <div className="flex items-center justify-between mb-4">
         <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
           <Mic className="w-4 h-4" />
           Voice Casting
         </h3>
         {showSaved && (
           <span className="text-xs text-emerald-400 flex items-center animate-fade-in-out">
             <CheckCircle2 className="w-3 h-3 mr-1" />
             Saved
           </span>
         )}
      </div>

      {/* Sticky Status Bar */}
      {(isLoading || isAudioPlaying) && activeChar && (
        <div className="sticky top-0 z-20 -mx-4 -mt-3 mb-3 bg-indigo-900/95 backdrop-blur-sm border-y border-indigo-500/30 p-2 flex items-center justify-between shadow-lg">
           <div className="flex items-center gap-2 px-2">
             {isLoading ? <Loader className="w-3 h-3 animate-spin text-indigo-300" /> : <Volume2 className="w-3 h-3 text-emerald-400" />}
             <span className="text-xs font-medium text-white">
               {isLoading ? `Generating ${activeChar}...` : `Playing ${activeChar}...`}
             </span>
           </div>
           <button 
             onClick={onStop}
             className="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded uppercase font-bold tracking-wider mr-2"
           >
             Stop
           </button>
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {renderControlRow('Narrator')}
        {characters.map(char => renderControlRow(char))}
      </div>
    </div>
  );
};