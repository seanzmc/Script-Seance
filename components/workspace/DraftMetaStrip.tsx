import React from 'react';
import { Pencil, Redo2, Undo2 } from 'lucide-react';

export interface DraftMetaStripProps {
  title: string;
  genreLabel: string;
  styleLabel: string;
  sceneCount: number;
  autosaveError: string | null;
  activeSceneHeading: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo: () => void;
  onRedo?: () => void;
  onEditTitle: () => void;
  onEditStyle?: () => void;
}

const metaChipClassName = 'inline-flex items-center gap-1.5 rounded-full border border-gray-800 bg-gray-950/55 px-3 py-1 text-[11px] text-gray-300';

export const DraftMetaStrip: React.FC<DraftMetaStripProps> = ({
  title,
  genreLabel,
  styleLabel,
  sceneCount,
  autosaveError,
  activeSceneHeading,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onEditTitle,
  onEditStyle
}) => (
  <section className="rounded-2xl border border-gray-800 bg-gray-950/35 p-4 sm:p-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Draft Workspace</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-[0.08em] text-white sm:text-2xl">
              {title}
            </h1>
            <button
              type="button"
              onClick={onEditTitle}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200 transition-colors hover:bg-indigo-500/20"
            >
              <Pencil className="h-3 w-3" />
              Edit Title
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={metaChipClassName}>
            <span className="font-semibold text-gray-100">Genre</span>
            {genreLabel}
          </span>
          <span className={metaChipClassName}>
            <span className="font-semibold text-gray-100">Style</span>
            <span>{styleLabel}</span>
            {onEditStyle && (
              <button
                type="button"
                onClick={onEditStyle}
                aria-label="Edit Style"
                className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-200 transition-colors hover:text-indigo-100"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </span>
          <span className={metaChipClassName}>
            <span className="font-semibold text-gray-100">Scenes</span>
            {sceneCount}
          </span>
          {activeSceneHeading && (
            <span className={`${metaChipClassName} max-w-full`}>
              <span className="font-semibold text-gray-100">Current</span>
              <span className="truncate uppercase tracking-[0.05em]">{activeSceneHeading}</span>
            </span>
          )}
          {autosaveError && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
              Autosave warning
              <span className="text-amber-100">{autosaveError}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </button>
        <button
          type="button"
          onClick={() => onRedo?.()}
          disabled={!canRedo || !onRedo}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
          Redo
        </button>
      </div>
    </div>
  </section>
);
