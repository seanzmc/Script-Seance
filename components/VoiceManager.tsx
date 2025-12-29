import React, { useState, useEffect } from 'react';
import { VoiceConfig, AVAILABLE_VOICES } from '../types';
import { Mic, Volume2, Loader, Square, CheckCircle2, Settings2, ChevronDown, ChevronUp, Sliders } from 'lucide-react';

interface VoiceManagerProps {
  characters: string[];
  voiceConfigs: VoiceConfig[];
  onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void;
  onOpenCasting: (character: string) => void;
  onPreview: (config: VoiceConfig) => Promise<void>;
  onStop: () => void;
  isAudioPlaying: boolean;
  isLoading: boolean;
  globalSpeed: number;
  onGlobalSpeedChange: (speed: number) => void;
}

export const VoiceManager: React.FC<VoiceManagerProps> = ({ 
  characters, 
  voiceConfigs, 
  onUpdateConfig,
  onOpenCasting,
  onPreview,
  onStop,
  isAudioPlaying,
  isLoading,
  globalSpeed,
  onGlobalSpeedChange
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
    const timer = setTimeout(() => setShowSaved(false), 2000);
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

  const renderControlRow = (char: string) => {
    const config = getConfig(char);
    const isActive = activeChar === char;
    const isThisLoading = isActive && isLoading;
    const isThisPlaying = isActive && isAudioPlaying;
    const isExpanded = expandedChars[char];
    
    return (
      <div key={char} className={`bg-gray-800 rounded-xl border transition-all overflow-hidden ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-gray-700/50'}`}>
        <div className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-white font-bold truncate" title={char}>
                {char}
              </span>
              <span className="text-[10px] text-indigo-400 font-medium">{config.voiceId}</span>
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => onOpenCasting(char)}
                className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-700/50 rounded-lg transition-all"
                title="Change Voice"
              >
                <Settings2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handlePreview(char, config)}
                className={`p-2 rounded-lg transition-all ${
                  (isThisLoading || isThisPlaying) 
                    ? 'text-white bg-red-600 shadow-lg shadow-red-900/20' 
                    : 'text-gray-400 hover:text-emerald-400 hover:bg-gray-700/50'
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

              <button
                onClick={() => toggleExpand(char)}
                className={`p-2 text-gray-500 hover:text-gray-300 rounded-lg transition-all ${isExpanded ? 'bg-gray-700/50' : ''}`}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 pb-4 pt-1 bg-black/10 border-t border-gray-700/30 animate-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-2 gap-4">
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
                  <span className="text-[10px] text-gray-300 bg-gray-700 px-1 rounded">{config.pitch || '0'}</span>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Global Controls Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Global Defaults
          </h3>
          {showSaved && (
             <span className="text-[10px] text-emerald-400 font-bold flex items-center animate-fade-in-out">
               <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
               Synced
             </span>
           )}
        </div>

        <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/50 space-y-4">
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Playback Speed</label>
                <span className="text-xs text-indigo-400 font-bold">{globalSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={globalSpeed}
                onChange={(e) => onGlobalSpeedChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 text-center">Master speed setting for all character voices.</p>
        </div>
      </section>

      {/* Character List Section */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Characters & Voices
        </h3>

        <div className="space-y-2 pb-8">
          {renderControlRow('Narrator')}
          {characters.map(char => renderControlRow(char))}
        </div>
      </section>

      {/* Persistent Status Bar for previews */}
      {(isLoading || isAudioPlaying) && activeChar && (
        <div className="fixed bottom-20 left-4 right-4 md:left-8 md:right-auto md:w-64 z-50 bg-indigo-950 border border-indigo-500/50 rounded-lg p-2 shadow-2xl animate-in slide-in-from-bottom-2 flex items-center justify-between">
           <div className="flex items-center gap-2 px-1">
             {isLoading ? <Loader className="w-3 h-3 animate-spin text-indigo-300" /> : <Volume2 className="w-3 h-3 text-emerald-400" />}
             <span className="text-[10px] font-bold text-white uppercase tracking-wider">
               {isLoading ? `Gen: ${activeChar}` : `Playing: ${activeChar}`}
             </span>
           </div>
           <button 
             onClick={onStop}
             className="text-[9px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded font-bold uppercase"
           >
             Stop
           </button>
        </div>
      )}
    </div>
  );
};
