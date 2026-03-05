import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X
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

export interface PlaybackMiniPlayerProps extends PlaybackPanelProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  showCloseButton?: boolean;
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
  const controlButtonClass = 'flex items-center justify-center h-8 w-8 rounded-md border border-gray-700 bg-gray-900/50 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed';
  const toggleTrackClass = 'ml-1 w-8 h-4 rounded-full flex items-center px-0.5 transition-colors';

  return (
    // ToolPanelShell owns scrolling; keep tool roots overflow-free unless absolutely required.
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Transport
        </h4>
        <span className="text-[10px] text-gray-500">
          Speaking: <span className="text-gray-300">{currentSpeaker}</span>
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
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
                className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${
                  isPlaying
                    ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40'
                    : 'bg-indigo-500/85 border-indigo-400 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/30'
                }`}
                title={isPlaying ? 'Pause playback' : isPaused ? 'Resume playback' : 'Play script'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
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

            <div className="min-w-0 sm:min-w-[160px] flex-1 flex items-center gap-3 justify-start sm:justify-end">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-white">{statusHeadline}</p>
                <p className="text-[10px] text-gray-400">{statusDetail}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] text-gray-400">
              Audio generation: {progressCount}/{totalCount || 0}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={onRefreshAudio}
                disabled={totalCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Regenerate all script audio using current voice casting"
              >
                <RotateCcw className="w-3 h-3" />
                Refresh Audio
              </button>
              <button
                onClick={onPurgeAudio}
                disabled={!hasAudio}
                className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Clear generated playback blocks and cached audio"
              >
                <Trash2 className="w-3 h-3" />
                Purge
              </button>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Speed</span>
              <span className="text-[11px] text-indigo-300 font-semibold">{playbackSpeed.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
                className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Playback speed"
              />
            </div>
          </div>

          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {isLoadingAudio && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for current block audio.
            </div>
          )}
          {currentStatus === 'error' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-300">
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Audio failed for this block.
              </div>
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-md border border-amber-400/50 px-3 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
              >
                <RotateCcw className="w-3 h-3" />
                Retry block
              </button>
              <button
                onClick={onSkip}
                className="flex items-center gap-1.5 rounded-md border border-amber-400/50 px-3 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
              >
                <SkipForward className="w-3 h-3" />
                Skip block
              </button>
            </div>
          )}
          {errorCount > 0 && currentStatus !== 'error' && (
            <div className="text-[10px] text-amber-300">
              {errorCount} block{errorCount === 1 ? '' : 's'} need attention. Jump back to retry or skip.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onToggleAutoScroll}
          aria-pressed={autoScroll}
          className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900/40 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500"
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
          className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900/40 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500"
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

export const PlaybackMiniPlayer: React.FC<PlaybackMiniPlayerProps> = ({
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
  onToggleAutoScroll,
  isExpanded,
  onToggleExpanded,
  onClose,
  showCloseButton = true
}) => {
  const {
    currentStatus,
    progressCount,
    canNavigate,
    atStart,
    atEnd,
    statusDetail
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

  const controlButtonClass = 'flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const toggleTrackClass = 'ml-1 w-8 h-4 rounded-full flex items-center px-0.5 transition-colors';
  const speakerLabel = currentSpeaker?.trim() || 'None';

  return (
    <div className="flex h-full min-h-0 flex-col rounded-t-2xl border border-gray-800 border-b-0 bg-gray-950/95 px-3 py-2 shadow-[0_-18px_38px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canNavigate || atStart}
              className={controlButtonClass}
              title="Previous block"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              aria-pressed={isPlaying}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                isPlaying
                  ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border-indigo-400 bg-indigo-500/90 text-white hover:bg-indigo-500'
              }`}
              title={isPlaying ? 'Pause playback' : isPaused ? 'Resume playback' : 'Play script'}
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={onStop}
              className={controlButtonClass}
              title="Stop playback"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNavigate || atEnd}
              className={controlButtonClass}
              title="Next block"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <p className="min-w-0 flex-1 truncate text-[10px] text-gray-400">
            Speaking: <span className="text-gray-200">{speakerLabel}</span>
          </p>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-700 bg-gray-900/55 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200 transition-colors hover:bg-gray-800"
            aria-label={isExpanded ? 'Collapse playback details' : 'Expand playback details'}
            title={isExpanded ? 'Collapse playback details' : 'Expand playback details'}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            {isExpanded ? 'Less' : 'More'}
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Close playback mini-player"
              title="Close playback mini-player"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-gray-300">{statusDetail}</p>
          <span className="shrink-0 text-[10px] text-gray-500">
            Audio generation: {progressCount}/{totalCount || 0}
          </span>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-gray-800 pt-1">
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onRefreshAudio}
                disabled={totalCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
                title="Regenerate all script audio using current voice casting"
              >
                <RotateCcw className="h-3 w-3" />
                Refresh Audio
              </button>
              <button
                onClick={onPurgeAudio}
                disabled={totalCount === 0}
                className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
                title="Clear generated playback blocks and cached audio"
              >
                <Trash2 className="h-3 w-3" />
                Purge
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-500">Speed</span>
              <span className="text-[11px] font-semibold text-indigo-300">{playbackSpeed.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
                className="h-1 w-28 cursor-pointer appearance-none rounded-lg bg-gray-700 accent-indigo-500"
                title="Playback speed"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onToggleAutoScroll}
                aria-pressed={autoScroll}
                className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900/40 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500"
                title="Auto-scroll script with playback"
              >
                <ScrollText className={`h-3.5 w-3.5 ${autoScroll ? 'text-indigo-400' : 'text-gray-500'}`} />
                Auto-scroll
                <span className={`${toggleTrackClass} ${autoScroll ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-4' : ''}`} />
                </span>
              </button>
              <button
                onClick={onToggleHighlights}
                aria-pressed={showHighlights}
                className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900/40 px-3 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:border-gray-500"
                title="Highlight the active line during playback"
              >
                <HighlightIcon className={`h-3.5 w-3.5 ${showHighlights ? 'text-indigo-400' : 'text-gray-500'}`} />
                Highlight
                <span className={`${toggleTrackClass} ${showHighlights ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${showHighlights ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            </div>
            {isLoadingAudio && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for current block audio.
              </div>
            )}
            {currentStatus === 'error' && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-300">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Audio failed for this block.
                </div>
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1.5 rounded-md border border-amber-400/50 px-3 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry block
                </button>
                <button
                  onClick={onSkip}
                  className="flex items-center gap-1.5 rounded-md border border-amber-400/50 px-3 py-1 text-[10px] uppercase tracking-widest text-amber-200 hover:border-amber-300 hover:text-amber-100"
                >
                  <SkipForward className="h-3 w-3" />
                  Skip block
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
