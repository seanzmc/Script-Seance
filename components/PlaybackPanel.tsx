import React from 'react';
import { Play, Pause, Loader2, ScrollText, ChevronDown } from 'lucide-react';

interface PlaybackPanelProps {
  isPlaying: boolean;
  isLoadingAudio: boolean;
  onPlay: () => void;
  onStop: () => void;
  bufferedCount: number;
  totalCount: number;
  currentSpeaker: string;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  showHighlights: boolean;
  onToggleHighlights: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
}

export const PlaybackPanel: React.FC<PlaybackPanelProps> = ({
  isPlaying,
  isLoadingAudio,
  onPlay,
  onStop,
  bufferedCount,
  totalCount,
  currentSpeaker,
  playbackSpeed,
  onPlaybackSpeedChange,
  showHighlights,
  onToggleHighlights,
  autoScroll,
  onToggleAutoScroll
}) => {
  const progress = totalCount > 0 ? Math.min(bufferedCount / totalCount, 1) : 0;
  const isBuffering = totalCount > 0 && bufferedCount < totalCount;
  const hasAudio = totalCount > 0;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Transport
          </h4>
          <span className="text-[10px] text-gray-500">
            Speaking: <span className="text-gray-300">{currentSpeaker}</span>
          </span>
        </div>
        <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={isPlaying ? onStop : onPlay}
              className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
                isPlaying
                  ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40'
              }`}
              title={isPlaying ? 'Stop playback' : 'Play script'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <div>
              <p className="text-sm font-semibold text-white">
                {isPlaying ? 'Playback running' : 'Ready to perform'}
              </p>
              <p className="text-[11px] text-gray-400">
                {isBuffering ? 'Generating audio...' : hasAudio ? 'Audio is ready.' : 'Audio not generated yet.'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>Audio generation</span>
              <span>{bufferedCount}/{totalCount || 0} blocks</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            {isLoadingAudio && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating audio in the background.
              </div>
            )}
          </div>
        </div>
      </section>

      <details className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 text-sm font-semibold text-gray-300">
          <span>Advanced / Playback options</span>
          <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-4">
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Playback Speed
            </h4>
            <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gray-500 uppercase font-bold">Speed</span>
                <span className="text-xs text-indigo-300 font-bold">{playbackSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Playback speed"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Focus & Scroll
            </h4>
            <div className="space-y-2 bg-gray-900/40 p-4 rounded-xl border border-gray-700/50">
              <button
                onClick={onToggleAutoScroll}
                className="w-full flex items-center justify-between text-left text-sm text-gray-300"
                title="Auto-scroll script with playback"
              >
                <span className="flex items-center gap-2">
                  <ScrollText className={`w-4 h-4 ${autoScroll ? 'text-indigo-400' : 'text-gray-500'}`} />
                  Auto-scroll script
                </span>
                <span className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${autoScroll ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`w-4 h-4 bg-white rounded-full transition-transform ${autoScroll ? 'translate-x-4' : ''}`} />
                </span>
              </button>
              <button
                onClick={onToggleHighlights}
                className="w-full flex items-center justify-between text-left text-sm text-gray-300"
                title="Highlight the active line during playback"
              >
                <span className="flex items-center gap-2">
                  <HighlightIcon className={`w-4 h-4 ${showHighlights ? 'text-indigo-400' : 'text-gray-500'}`} />
                  Highlight active line
                </span>
                <span className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${showHighlights ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`w-4 h-4 bg-white rounded-full transition-transform ${showHighlights ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
};

const HighlightIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
);
