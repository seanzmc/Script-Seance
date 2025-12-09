import React from 'react';
import { VoiceConfig, AVAILABLE_VOICES } from '../types';
import { Mic, Volume2, Play } from 'lucide-react';

interface VoiceManagerProps {
  characters: string[];
  voiceConfigs: VoiceConfig[];
  onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void;
  onPreview: (config: VoiceConfig) => void;
}

export const VoiceManager: React.FC<VoiceManagerProps> = ({ 
  characters, 
  voiceConfigs, 
  onUpdateConfig,
  onPreview 
}) => {
  
  const getConfig = (char: string): VoiceConfig => {
    return voiceConfigs.find(c => c.name === char) || { 
      name: char, 
      voiceId: AVAILABLE_VOICES[0],
      speed: 1,
      pitch: 0
    };
  };

  const renderControlRow = (char: string) => {
    const config = getConfig(char);
    
    return (
      <div key={char} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
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
              onClick={() => onPreview(config)}
              className="p-1.5 hover:bg-gray-700 rounded-md text-indigo-400 transition-colors"
              title="Preview Voice"
            >
              <Volume2 className="w-4 h-4" />
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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-4">
        <Mic className="w-4 h-4" />
        Voice Casting
      </h3>
      <div className="space-y-2">
        {renderControlRow('Narrator')}
        {characters.map(char => renderControlRow(char))}
      </div>
    </div>
  );
};