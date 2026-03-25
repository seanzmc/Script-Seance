import React from 'react';
import { Pause, Play, SkipBack, SkipForward, Speech, Square } from 'lucide-react';
import type { PlaybackPanelProps } from './PlaybackPanel';

type PlaybackMiniPlayerProps = Pick<
  PlaybackPanelProps,
  | 'isPlaying'
  | 'isPaused'
  | 'currentBlockIndex'
  | 'totalCount'
  | 'currentSpeaker'
  | 'onPlay'
  | 'onPause'
  | 'onResume'
  | 'onStop'
  | 'onPrev'
  | 'onNext'
> & {
  onOpenAudioDrawer: () => void;
};

const buildStatusText = ({
  isPlaying,
  isPaused,
  currentBlockIndex,
  totalCount
}: Pick<PlaybackMiniPlayerProps, 'isPlaying' | 'isPaused' | 'currentBlockIndex' | 'totalCount'>) => {
  const activeBlockNumber = totalCount > 0
    ? Math.max(1, Math.min(currentBlockIndex + 1, totalCount))
    : 0;

  if (isPlaying && totalCount > 0) {
    return `Playing block ${activeBlockNumber}/${totalCount}`;
  }
  if (isPaused && totalCount > 0) {
    return `Paused on block ${activeBlockNumber}/${totalCount}`;
  }
  return 'Playback ready';
};

export const PlaybackMiniPlayer: React.FC<PlaybackMiniPlayerProps> = ({
  isPlaying,
  isPaused,
  currentBlockIndex,
  totalCount,
  currentSpeaker,
  onPlay,
  onPause,
  onResume,
  onStop,
  onPrev,
  onNext,
  onOpenAudioDrawer
}) => {
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

  const statusText = buildStatusText({
    isPlaying,
    isPaused,
    currentBlockIndex,
    totalCount
  });
  const controlButtonClass = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-900/75 text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      data-testid="playback-mini-player"
      className="fixed inset-x-3 bottom-3 z-mini-player sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[min(24rem,calc(100vw-2rem))]"
    >
      <div className="rounded-2xl border border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.96),rgba(10,15,28,0.94))] px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.4)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{currentSpeaker}</p>
            <p className="truncate text-[11px] text-gray-400">{statusText}</p>
          </div>
          <button
            type="button"
            onClick={onOpenAudioDrawer}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900/65 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            aria-label="Open full audio drawer"
            title="Audio"
          >
            <Speech className="h-3.5 w-3.5" />
            Audio
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={totalCount === 0 || currentBlockIndex <= 0}
            className={controlButtonClass}
            title="Previous block"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-400 bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition-colors hover:bg-indigo-400"
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
            disabled={totalCount === 0 || currentBlockIndex >= totalCount - 1}
            className={controlButtonClass}
            title="Next block"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
