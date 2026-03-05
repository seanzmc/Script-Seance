import React from 'react';
import { Search, Shuffle } from 'lucide-react';
import { StyleItem } from '../stylesLibrary';

export interface StyleSelectionCardProps {
  selectedStyle: StyleItem | null;
  fallbackLabel: string;
  categoryLabel?: string | null;
  onBrowse: () => void;
  onClear?: () => void;
  onShuffle?: () => void;
  disabled?: boolean;
  browseLabel?: string;
}

export const StyleSelectionCard: React.FC<StyleSelectionCardProps> = ({
  selectedStyle,
  fallbackLabel,
  categoryLabel,
  onBrowse,
  onClear,
  onShuffle,
  disabled = false,
  browseLabel = 'Browse'
}) => {
  const resolvedLabel = selectedStyle?.title ?? fallbackLabel;
  const isBlank = !selectedStyle && fallbackLabel === 'None (default style)';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Selected style
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-white">{resolvedLabel}</p>
            {categoryLabel && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                {categoryLabel}
              </span>
            )}
          </div>
        </div>
        {onClear && !isBlank && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>

      {selectedStyle ? (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-slate-300">{selectedStyle.description}</p>
          <p className="text-sm leading-relaxed text-slate-200">
            <span className="font-semibold text-slate-400">Sample line:</span>{' '}
            {selectedStyle.sampleLine}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-300">
          {isBlank ? 'Using default tone settings.' : 'Custom style selected.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            disabled={disabled}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-indigo-300/35 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/22 disabled:opacity-60"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </button>
        )}
        <button
          type="button"
          onClick={onBrowse}
          disabled={disabled}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-indigo-300/35 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/22 disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          {browseLabel}
        </button>
      </div>
    </div>
  );
};
