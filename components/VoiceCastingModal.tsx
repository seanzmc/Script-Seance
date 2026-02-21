import React, { useState, useMemo } from 'react';
import { X, Play, Check, Mic, User, Pause, Info, ChevronLeft } from 'lucide-react';
import { VoiceConfig, TtsVoice } from '../types';

export interface VoiceCastingModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  currentVoiceId: string;
  availableVoices: TtsVoice[];
  voiceConfigs: VoiceConfig[];
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
  isPreviewing?: boolean;
  previewVoiceId?: string | null;
  isPreviewEnabled?: boolean;
  embedded?: boolean;
  onBack?: () => void;
}

interface VoiceData {
  id: string;
  name: string;
  gender: string;
  category: string;
  description: string;
  labels: string[];
  tags: string[];
  source: string;
  isCustom: boolean;
}

const FILTERS = ['All', 'Masculine', 'Feminine', 'High Energy', 'Calm', 'Deep'];
const PLACEHOLDER_META = new Set(['unknown', 'general']);
const formatTagLabel = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
const normalizeTagToken = (value?: string) =>
  typeof value === 'string'
    ? value
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : '';
const sanitizeMetaValue = (value?: string) => {
  const normalized = value?.trim();
  if (!normalized) return '';
  if (PLACEHOLDER_META.has(normalized.toLowerCase())) return '';
  return normalized;
};
const sanitizeMetaList = (values?: string[]) => {
  const next = new Set<string>();
  (values || []).forEach((value) => {
    const normalized = sanitizeMetaValue(value)?.toLowerCase();
    if (normalized) {
      next.add(normalized);
    }
  });
  return [...next];
};

const toVoiceData = (voice: TtsVoice): VoiceData => {
  const labels = sanitizeMetaList(voice.labels);
  const tags = sanitizeMetaList(voice.tags && voice.tags.length > 0 ? voice.tags : labels);
  const gender = sanitizeMetaValue(voice.gender);
  const category = sanitizeMetaValue(voice.category || (voice.isCustom ? 'Custom' : ''));
  return {
    id: voice.id,
    name: voice.displayName || voice.id,
    gender,
    category,
    description: voice.description || 'Inworld voice.',
    labels,
    tags,
    source: voice.source,
    isCustom: voice.isCustom
  };
};
const getExtraTraitTags = (voice: VoiceData) => {
  const canonicalTags = new Set(
    [voice.gender, voice.category]
      .map((value) => normalizeTagToken(value))
      .filter(Boolean)
  );
  const seen = new Set<string>();
  const extras: string[] = [];

  voice.tags.forEach((tag) => {
    const normalized = normalizeTagToken(tag);
    if (!normalized || canonicalTags.has(normalized) || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    extras.push(formatTagLabel(normalized));
  });

  return extras;
};

export const VoiceCastingModal: React.FC<VoiceCastingModalProps> = ({
  isOpen,
  onClose,
  characterName,
  currentVoiceId,
  availableVoices,
  voiceConfigs,
  onSelect,
  onPreview,
  isPreviewing,
  previewVoiceId,
  isPreviewEnabled = true,
  embedded = false,
  onBack
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

  const mergedVoices = useMemo(() => {
    const dynamic = availableVoices.map(toVoiceData);
    if (dynamic.some((voice) => voice.id === currentVoiceId)) {
      return dynamic;
    }
    if (currentVoiceId) {
      return [{
        id: currentVoiceId,
        name: currentVoiceId,
        gender: 'Unknown',
        category: 'Unavailable',
        description: 'Voice assigned in draft but missing from active provider catalog.',
        labels: [],
        tags: [],
        source: 'assigned-unavailable',
        isCustom: false
      }, ...dynamic];
    }
    return dynamic;
  }, [availableVoices, currentVoiceId]);

  const filteredVoices = useMemo(() => {
    let result = mergedVoices;
    
    // Category Filter
    if (activeFilter !== 'All') {
      result = result.filter((v) => {
        if (v.gender === activeFilter || v.category === activeFilter) {
          return true;
        }
        return v.labels.some((label) => label.toLowerCase() === activeFilter.toLowerCase());
      });
    }
    
    // Availability Filter
    if (showAvailableOnly) {
      result = result.filter(v => !assignedMap[v.id] || assignedMap[v.id].length === 0);
    }
    
    return result;
  }, [activeFilter, showAvailableOnly, assignedMap, mergedVoices]);
  const availableVoiceIds = useMemo(
    () => new Set(availableVoices.map((voice) => voice.id)),
    [availableVoices]
  );

  if (!isOpen) return null;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    onClose();
  };

  const containerClassName = embedded
    ? 'w-full'
    : 'fixed inset-0 z-[60] flex items-center justify-center p-4';
  const contentClassName = embedded
    ? 'relative w-full rounded-xl border border-gray-800 bg-gray-900 flex flex-col overflow-hidden'
    : 'relative bg-gray-900 w-full max-w-4xl h-[85vh] rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200';

  return (
    <div className={containerClassName}>
      {!embedded && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={contentClassName}
        role="dialog"
        aria-modal={embedded ? undefined : true}
        aria-label={`Cast voices for ${characterName}`}
      >
        <div className={`flex items-center justify-between border-b border-gray-800 bg-gray-900/50 ${embedded ? 'px-3 py-1.5' : 'px-6 py-4'}`}>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              {embedded && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-700 bg-gray-900/70 px-1.5 text-[10px] font-semibold text-gray-200 transition-colors hover:bg-gray-800"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Back
                </button>
              )}
              <h2 className={`font-bold text-white flex items-center gap-1.5 ${embedded ? 'text-sm' : 'text-lg'}`}>
                <Mic className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-indigo-400`} />
                CAST VOICES
              </h2>
            </div>
            <p
              className={`${embedded ? 'text-[11px]' : 'text-sm'} text-gray-300 truncate`}
              title={`Casting: ${characterName}`}
            >
              Casting: <span className="text-indigo-300 font-semibold">{characterName}</span>
            </p>
            <p className={`${embedded ? 'text-[11px] leading-tight' : 'text-sm'} text-gray-400`}>Assign a voice to your character.</p>
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors shrink-0"
              aria-label="Close voice casting"
            >
              <X className={embedded ? 'w-5 h-5' : 'w-6 h-6'} />
            </button>
          )}
        </div>

        <div className={`${embedded ? 'px-3 py-1.5' : 'px-6 py-3'} border-b border-gray-800 bg-gray-900/50 flex flex-col md:flex-row md:items-center justify-between gap-2`}>
          <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {FILTERS.map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`h-8 px-3 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
                  activeFilter === filter
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAvailableOnly(!showAvailableOnly)}
              aria-pressed={showAvailableOnly}
              className={`h-8 rounded-full px-2.5 text-[11px] font-medium transition-all inline-flex items-center gap-1.5 ${
                showAvailableOnly
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-gray-800 text-gray-400 border border-transparent hover:bg-gray-700'
              }`}
            >
              <Info className="w-3 h-3" />
              <span>Available only</span>
              <span className={`relative inline-flex h-4 w-8 rounded-full transition-colors ${showAvailableOnly ? 'bg-emerald-500/70' : 'bg-gray-600/90'}`}>
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${showAvailableOnly ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </span>
            </button>
          </div>
        </div>

        <div className={`${embedded ? 'p-2' : 'flex-1 min-h-0 overflow-y-auto p-4'} bg-black/20`}>
          {filteredVoices.length === 0 ? (
            <div className="min-h-[140px] flex flex-col items-center justify-center text-gray-500 space-y-2">
              <Mic className="w-12 h-12 opacity-20" />
              <p>No voices match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredVoices.map((voice) => {
                const isSelected = currentVoiceId === voice.id;
                const isPlaying = isPreviewing && previewVoiceId === voice.id;
                const assignments = assignedMap[voice.id] || [];
                const isAssignedElsewhere = assignments.length > 0;
                const extraTraits = getExtraTraitTags(voice);
                const canPreviewVoice = isPreviewEnabled && availableVoiceIds.has(voice.id);
                const previewTitle = canPreviewVoice
                  ? (isPlaying ? 'Stop preview' : 'Preview')
                  : 'TTS provider not configured';

                return (
                  <div
                    key={voice.id}
                    onClick={() => onSelect(voice.id)}
                    className={`group relative flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/30'
                        : isPlaying
                        ? 'bg-indigo-800/20 border-indigo-400 shadow-lg'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-800/80 shadow-sm'
                    }`}
                  >
                    {/* Top Row: Name & Active State */}
                    <div className="flex justify-between items-start mb-1">
                      <div className="overflow-hidden">
                        <h3 className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                          {voice.name}
                        </h3>
                        {(voice.gender || voice.category) && (
                          <div className="flex gap-1 mt-0.5">
                            {voice.gender && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-700 text-gray-400'
                              }`}>
                                {voice.gender}
                              </span>
                            )}
                            {voice.category && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-700 text-gray-400'
                              }`}>
                                {voice.category}
                              </span>
                            )}
                          </div>
                        )}
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
                    <p className="text-[11px] text-gray-400 mb-2 leading-snug line-clamp-2 flex-1">
                      {voice.description}
                    </p>

                    {extraTraits.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {extraTraits.slice(0, 4).map((tag) => (
                          <span
                            key={`${voice.id}-${tag}`}
                            className={`px-1.5 py-0 rounded text-[10px] ${
                              isSelected ? 'bg-indigo-500/25 text-indigo-200' : 'bg-gray-700/80 text-gray-300'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Assigned Status */}
                    <div className="mb-2 pt-2 border-t border-gray-700/50">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-tight">
                        <User className={`w-3 h-3 ${isAssignedElsewhere ? 'text-indigo-400' : 'text-emerald-400'}`} />
                        <span className={isAssignedElsewhere ? 'text-indigo-300' : 'text-emerald-400'}>
                          {isAssignedElsewhere ? `In use by: ${assignments.join(', ')}` : 'Available'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={(e) => {
                          if (!canPreviewVoice) return;
                          e.stopPropagation();
                          onPreview(voice.id);
                        }}
                        aria-label={previewTitle}
                        disabled={!canPreviewVoice}
                        className={`h-9 px-2.5 rounded-md text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${
                          !canPreviewVoice
                            ? 'bg-gray-800/60 text-gray-500 cursor-not-allowed'
                            : isPlaying 
                            ? 'bg-indigo-500 text-white shadow-inner' 
                            : 'bg-gray-700 text-gray-300 hover:bg-indigo-600 hover:text-white'
                        }`}
                        title={previewTitle}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                        <span>{isPlaying ? 'Stop' : 'Preview'}</span>
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

        <div className={`${embedded ? 'px-3 py-2' : 'p-4'} border-t border-gray-800 bg-gray-900/50 flex justify-between items-center`}>
           <div className="text-xs text-gray-500 flex items-center gap-2">
             <Info className="w-3.5 h-3.5" />
             Previewing {characterName}&apos;s existing lines.
           </div>
           {!embedded && (
             <button
               type="button"
               onClick={handleBack}
               className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
             >
               Close
             </button>
           )}
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
