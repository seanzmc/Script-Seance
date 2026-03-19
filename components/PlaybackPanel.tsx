import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipBack,
  SkipForward,
  Square,
  Trash2
} from 'lucide-react';

export interface PlaybackPanelProps {
  isPlaying: boolean;
  isPaused: boolean;
  isLoadingAudio: boolean;
  currentBlockId: string | null;
  currentBlockIndex: number;
  blockStatuses: Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRetry: () => void;
  onSkip: () => void;
  onRefreshAudio: () => void;
  onPurgeAudio: () => void;
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

type PlaybackState = 'idle' | 'generating' | 'ready' | 'playing' | 'paused' | 'error';

interface PlaybackViewModel {
  currentStatus: 'notGenerated' | 'generating' | 'ready' | 'error' | undefined;
  progressCount: number;
  totalCount: number;
  progress: number;
  hasAudio: boolean;
  canNavigate: boolean;
  atStart: boolean;
  atEnd: boolean;
  statusHeadline: string;
  statusDetail: string;
  activeBlockNumber: number;
  errorCount: number;
}

const buildPlaybackViewModel = ({
  isPlaying,
  isPaused,
  isLoadingAudio,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  bufferedCount,
  totalCount
}: Pick<
  PlaybackPanelProps,
  | 'isPlaying'
  | 'isPaused'
  | 'isLoadingAudio'
  | 'currentBlockId'
  | 'currentBlockIndex'
  | 'blockStatuses'
  | 'bufferedCount'
  | 'totalCount'
>): PlaybackViewModel => {
  const statusValues = Object.values(blockStatuses);
  const readyCount = statusValues.filter(status => status === 'ready').length;
  const errorCount = statusValues.filter(status => status === 'error').length;
  const progressCount = Math.min(Math.max(readyCount + errorCount, bufferedCount), totalCount);
  const progress = totalCount > 0 ? Math.min(progressCount / totalCount, 1) : 0;
  const hasAudio = totalCount > 0;
  const currentStatus = currentBlockId ? blockStatuses[currentBlockId] : undefined;
  const activeBlockNumber = totalCount > 0
    ? (currentBlockIndex >= 0 ? currentBlockIndex + 1 : Math.min(readyCount + 1, totalCount))
    : 0;
  const canNavigate = totalCount > 0;
  const atStart = currentBlockIndex <= 0;
  const atEnd = currentBlockIndex >= totalCount - 1;

  const playbackState: PlaybackState = (() => {
    if (!hasAudio) return 'idle';
    if (currentStatus === 'error') return 'error';
    if (isPaused) return 'paused';
    if (isLoadingAudio || (!isPlaying && progressCount < totalCount)) return 'generating';
    if (isPlaying) return 'playing';
    if (progressCount >= totalCount) return 'ready';
    return 'idle';
  })();

  const statusHeadline = (() => {
    if (playbackState === 'playing') return 'Playback running';
    if (playbackState === 'paused') return 'Playback paused';
    if (playbackState === 'error') return 'Audio error';
    if (playbackState === 'ready') return 'Ready to perform';
    if (playbackState === 'generating') return 'Generating audio';
    return 'Ready to perform';
  })();

  const statusDetail = (() => {
    if (playbackState === 'generating') {
      return `Generating audio (block ${activeBlockNumber}/${totalCount})...`;
    }
    if (playbackState === 'ready') {
      return `Audio ready (${totalCount}/${totalCount})`;
    }
    if (playbackState === 'paused') {
      return 'Playback paused';
    }
    if (playbackState === 'error') {
      return `Audio failed on block ${activeBlockNumber}/${totalCount}`;
    }
    if (playbackState === 'playing') {
      return `Playing block ${activeBlockNumber}/${totalCount}`;
    }
    return 'Audio not generated yet.';
  })();

  return {
    currentStatus,
    progressCount,
    totalCount,
    progress,
    hasAudio,
    canNavigate,
    atStart,
    atEnd,
    statusHeadline,
    statusDetail,
    activeBlockNumber,
    errorCount
  };
};

export const PlaybackPanel: React.FC<PlaybackPanelProps> = ({
  isPlaying,
  isPaused,
  isLoadingAudio,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  onPlay,
  onPause,
  onResume,
  onStop,
  onPrev,
  onNext,
  onRetry,
  onSkip,
  onRefreshAudio,
  onPurgeAudio,
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
  const {
    currentStatus,
    progressCount,
    progress,
    hasAudio,
    canNavigate,
    atStart,
    atEnd,
    statusHeadline,
    statusDetail,
    errorCount
  } = useMemo(
    () =>
      buildPlaybackViewModel({
        isPlaying,
        isPaused,
        isLoadingAudio,
        currentBlockId,
        currentBlockIndex,
        blockStatuses,
        bufferedCount,
        totalCount
      }),
    [isPlaying, isPaused, isLoadingAudio, currentBlockId, currentBlockIndex, blockStatuses, bufferedCount, totalCount]
  );

  const handlePlayPause = () => {
    if (isPlaying) {
      onPause();
      return;
    }
    if (isPaused) {
      onResume();
      return;
    }
    onPlay();
  };
  const controlButtonClass = 'flex items-center justify-center h-8 w-8 rounded-md border border-gray-700 bg-gray-900/50 text-gray-300 transition-colors hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed';
  const utilityButtonClass = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/40 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40';
  const toggleTrackClass = 'ml-1 w-7 h-3.5 rounded-full flex items-center px-0.5 transition-colors';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">
          Transport
        </h4>
        <span className="text-[10px] text-gray-400">
          Speaking: <span className="text-gray-300">{currentSpeaker}</span>
        </span>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-800/90 bg-gray-950/35 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPrev}
              disabled={!canNavigate || atStart}
              className={controlButtonClass}
              title="Previous block"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handlePlayPause}
              aria-pressed={isPlaying}
              className={`flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${
                isPlaying
                  ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500'
                  : 'bg-indigo-500/90 border-indigo-400 text-white hover:bg-indigo-500'
              }`}
              title={isPlaying ? 'Pause playback' : isPaused ? 'Resume playback' : 'Play script'}
            >
              {isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={onStop}
              className={controlButtonClass}
              title="Stop playback"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!canNavigate || atEnd}
              className={controlButtonClass}
              title="Next block"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="min-w-0 flex-1 text-left sm:text-right">
            <p className="text-sm font-semibold text-white">{statusHeadline}</p>
            <p className="text-[11px] text-gray-400">{statusDetail}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-gray-800/80 pt-2">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-gray-400">
            <span className="uppercase tracking-[0.14em] text-gray-500">Audio</span>
            <span>{progressCount}/{totalCount || 0}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={onRefreshAudio}
              disabled={totalCount === 0}
              className={utilityButtonClass}
              title="Regenerate all script audio using current voice casting"
            >
              <RotateCcw className="w-3 h-3" />
              Refresh
            </button>
            <button
              onClick={onPurgeAudio}
              disabled={!hasAudio}
              className={utilityButtonClass}
              title="Clear generated playback blocks and cached audio"
            >
              <Trash2 className="w-3 h-3" />
              Purge
            </button>
            <div className="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-950/45 px-2 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Speed</span>
              <span className="min-w-[2.4rem] text-right text-[11px] font-semibold text-indigo-200">{playbackSpeed.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
                className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Playback speed"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {isLoadingAudio && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for current block audio.
            </div>
          )}
          {currentStatus === 'error' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-300">
              <div className="flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Audio failed for this block.
              </div>
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded-md border border-amber-400/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
              >
                <RotateCcw className="w-3 h-3" />
                Retry block
              </button>
              <button
                onClick={onSkip}
                className="flex items-center gap-1 rounded-md border border-amber-400/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
              >
                <SkipForward className="w-3 h-3" />
                Skip block
              </button>
            </div>
          )}
          {errorCount > 0 && currentStatus !== 'error' && (
            <div className="text-[11px] text-amber-300">
              {errorCount} block{errorCount === 1 ? '' : 's'} need attention. Jump back to retry or skip.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-800/80 bg-gray-950/25 px-2.5 py-2">
        <button
          onClick={onToggleAutoScroll}
          aria-pressed={autoScroll}
          className="flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/35 px-2.5 text-[10px] uppercase tracking-[0.16em] text-gray-300 hover:border-gray-500"
          title="Auto-scroll script with playback"
        >
          <ScrollText className={`w-3.5 h-3.5 ${autoScroll ? 'text-indigo-400' : 'text-gray-500'}`} />
          Auto-scroll
          <span className={`${toggleTrackClass} ${autoScroll ? 'bg-indigo-600' : 'bg-gray-700'}`}>
            <span className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${autoScroll ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        <button
          onClick={onToggleHighlights}
          aria-pressed={showHighlights}
          className="flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/35 px-2.5 text-[10px] uppercase tracking-[0.16em] text-gray-300 hover:border-gray-500"
          title="Highlight the active line during playback"
        >
          <HighlightIcon className={`w-3.5 h-3.5 ${showHighlights ? 'text-indigo-400' : 'text-gray-500'}`} />
          Highlight
          <span className={`${toggleTrackClass} ${showHighlights ? 'bg-indigo-600' : 'bg-gray-700'}`}>
            <span className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${showHighlights ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      </div>
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
