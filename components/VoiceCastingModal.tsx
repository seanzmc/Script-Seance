import React, { useState, useMemo } from 'react';
import { X, Play, Check, Mic, Activity, Volume2, User, Pause } from 'lucide-react';

interface VoiceCastingModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  currentVoiceId: string;
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
  isPreviewing?: boolean; // Optional prop to show loading/playing state on a card
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
  onSelect,
  onPreview,
  isPreviewing,
  previewVoiceId
}) => {
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredVoices = useMemo(() => {
    if (activeFilter === 'All') return AVAILABLE_VOICES_DATA;
    return AVAILABLE_VOICES_DATA.filter(v => 
      v.gender === activeFilter || v.category === activeFilter
    );
  }, [activeFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            <p className="text-sm text-gray-400 mt-1">Select a voice profile for this character.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
          <div className="flex gap-2">
            {FILTERS.map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  activeFilter === filter
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-black/20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVoices.map((voice) => {
              const isSelected = currentVoiceId === voice.id;
              const isPlaying = isPreviewing && previewVoiceId === voice.id;

              return (
                <div
                  key={voice.id}
                  className={`group relative flex flex-col p-4 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? 'bg-indigo-900/20 border-indigo-500 shadow-xl shadow-indigo-900/10'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-800/80'
                  }`}
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 text-indigo-400">
                      <Check className="w-5 h-5" />
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {voice.name}
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider mt-1 ${
                        isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {voice.category}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-400 mb-6 leading-relaxed flex-1">
                    {voice.description}
                  </p>

                  <div className="flex items-center gap-2 mt-auto">
                     {/* Play Preview Button */}
                     <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview(voice.id);
                      }}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                        isPlaying 
                          ? 'bg-white text-indigo-600' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/30'
                      }`}
                      title="Preview Voice"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Select Button/Area */}
                    <button
                      onClick={() => onSelect(voice.id)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'bg-indigo-500/10 text-indigo-300 cursor-default'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select Voice'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end">
           <button 
             onClick={onClose}
             className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
           >
             Close
           </button>
        </div>

      </div>
    </div>
  );
};
