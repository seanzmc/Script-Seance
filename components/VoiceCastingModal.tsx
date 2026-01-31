import React, { useState, useMemo } from 'react';
import { X, Play, Check, Mic, User, Pause, Info } from 'lucide-react';
import { VoiceConfig } from '../types';

export interface VoiceCastingModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  currentVoiceId: string;
  voiceConfigs: VoiceConfig[];
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
  isPreviewing?: boolean;
  previewVoiceId?: string | null;
}

interface VoiceData {
  id: string;
  name: string;
  gender: 'Masculine' | 'Feminine';
  category: string;
  description: string;
}

const AVAILABLE_VOICES_DATA: VoiceData[] = [
  { id: 'Aoede', name: 'Aoede', gender: 'Feminine', category: 'Calm', description: 'Smooth, confident, and professional. The "Narrator" type.' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'Feminine', category: 'Warm', description: 'Gentle, warm, and slightly breathy. The "Friend".' },
  { id: 'Kore', name: 'Kore', gender: 'Feminine', category: 'Firm', description: 'Firm, clear, and direct. Good for reporters or pragmatic characters.' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'Feminine', category: 'Warm', description: 'Warm, motherly, and assuring. A "Guide" figure.' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'Feminine', category: 'High Energy', description: 'Breezy, cheerful, and fast. The "Sidekick".' },
  { id: 'Charon', name: 'Charon', gender: 'Masculine', category: 'Deep', description: 'Deep, resonant, and serious. The "Villain" or "Movie Trailer" voice.' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'Masculine', category: 'High Energy', description: 'Excitable, fast, and intense. The "Action Hero".' },
  { id: 'Puck', name: 'Puck', gender: 'Masculine', category: 'High Energy', description: 'Playful, mischievous, and higher-pitch. The "Trickster".' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'Masculine', category: 'Textured', description: 'Gravelly, informative, and older. The "Veteran".' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'Masculine', category: 'Calm', description: 'Smooth, easy-going, and low-stress. The "Cool Guy".' }
];

const FILTERS = ['All', 'Masculine', 'Feminine', 'High Energy', 'Calm', 'Deep'];

export const VoiceCastingModal: React.FC<VoiceCastingModalProps> = ({
  isOpen,
  onClose,
  characterName,
  currentVoiceId,
  voiceConfigs,
  onSelect,
  onPreview,
  isPreviewing,
  previewVoiceId
}) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Map of voiceId -> list of assigned characters
  const assignedMap = useMemo(() => {
    return voiceConfigs.reduce((acc, config) => {
      if (!acc[config.voiceId]) acc[config.voiceId] = [];
      acc[config.voiceId].push(config.name);
      return acc;
    }, {} as Record<string, string[]>);
  }, [voiceConfigs]);

  const filteredVoices = useMemo(() => {
    let result = AVAILABLE_VOICES_DATA;
    
    // Category Filter
    if (activeFilter !== 'All') {
      result = result.filter(v => v.gender === activeFilter || v.category === activeFilter);
    }
    
    // Availability Filter
    if (showAvailableOnly) {
      result = result.filter(v => !assignedMap[v.id] || assignedMap[v.id].length === 0);
    }
    
    return result;
  }, [activeFilter, showAvailableOnly, assignedMap]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-gray-900 w-full max-w-4xl h-[85vh] rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-indigo-400" />
              Voice Casting: <span className="text-indigo-400">{characterName}</span>
            </h2>
            <p className="text-sm text-gray-400 mt-1">Assign a voice to your character.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters & Toggles */}
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {FILTERS.map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  activeFilter === filter
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAvailableOnly(!showAvailableOnly)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 ${
                showAvailableOnly
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-gray-800 text-gray-400 border border-transparent hover:bg-gray-700'
              }`}
            >
              <Info className="w-3 h-3" />
              Available only
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-black/20">
          {filteredVoices.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
              <Mic className="w-12 h-12 opacity-20" />
              <p>No voices match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVoices.map((voice) => {
                const isSelected = currentVoiceId === voice.id;
                const isPlaying = isPreviewing && previewVoiceId === voice.id;
                const assignments = assignedMap[voice.id] || [];
                const isAssignedElsewhere = assignments.length > 0;

                return (
                  <div
                    key={voice.id}
                    onClick={() => onSelect(voice.id)}
                    className={`group relative flex flex-col p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/30'
                        : isPlaying
                        ? 'bg-indigo-800/20 border-indigo-400 shadow-lg'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-800/80 shadow-sm'
                    }`}
                  >
                    {/* Top Row: Name & Active State */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="overflow-hidden">
                        <h3 className={`font-bold text-base truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                          {voice.name}
                        </h3>
                        <div className="flex gap-1.5 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-700 text-gray-400'
                          }`}>
                            {voice.gender}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-700 text-gray-400'
                          }`}>
                            {voice.category}
                          </span>
                        </div>
                      </div>

                      {/* Right Indicator: Selected Check or Now Playing */}
                      <div className="flex items-center gap-2">
                         {isPlaying && (
                           <div className="flex gap-0.5">
                             <div className="w-1 h-3 bg-indigo-400 animate-[bounce_1s_infinite_0s] rounded-full"></div>
                             <div className="w-1 h-3 bg-indigo-400 animate-[bounce_1s_infinite_0.2s] rounded-full"></div>
                             <div className="w-1 h-3 bg-indigo-400 animate-[bounce_1s_infinite_0.4s] rounded-full"></div>
                           </div>
                         )}
                         {isSelected && <Check className="w-5 h-5 text-indigo-400" />}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-400 mb-4 leading-relaxed line-clamp-2 flex-1">
                      {voice.description}
                    </p>

                    {/* Assigned Status */}
                    <div className="mb-4 pt-3 border-t border-gray-700/50">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-tight">
                        <User className={`w-3 h-3 ${isAssignedElsewhere ? 'text-indigo-400' : 'text-emerald-400'}`} />
                        <span className={isAssignedElsewhere ? 'text-indigo-300' : 'text-emerald-400'}>
                          {isAssignedElsewhere ? `In use by: ${assignments.join(', ')}` : 'Available'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview(voice.id);
                        }}
                        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                          isPlaying 
                            ? 'bg-indigo-500 text-white shadow-inner' 
                            : 'bg-gray-700 text-gray-300 hover:bg-indigo-600 hover:text-white'
                        }`}
                        title={isPlaying ? "Stop Preview" : "Preview Voice"}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>
                      
                      <div className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-indigo-400' : 'text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                        {isSelected ? 'Current Voice' : 'Click to select'}
                      </div>
                    </div>
                    
                    {/* Visual playing overlay */}
                    {isPlaying && (
                       <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/50 overflow-hidden rounded-t-xl">
                         <div className="h-full bg-indigo-400 w-1/3 animate-[slide_2s_infinite_linear]"></div>
                       </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-between items-center">
           <div className="text-xs text-gray-500 flex items-center gap-2">
             <Info className="w-3.5 h-3.5" />
             Previewing {characterName}&apos;s existing lines.
           </div>
           <button 
             onClick={onClose}
             className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
           >
             Close
           </button>
        </div>

      </div>

      <style>{`
        @keyframes slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};
