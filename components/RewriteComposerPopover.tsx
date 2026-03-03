import React from 'react';
import { BlockType } from '../types';
import { Button } from './Button';

export interface RewriteComposerPopoverProps {
  blockType: BlockType;
  snippet: string;
  instructions: string;
  onInstructionsChange: (next: string) => void;
  candidateText: string;
  onGenerate: () => void;
  onApply: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  errorMessage: string | null;
}

const BLOCK_LABELS: Record<BlockType, string> = {
  [BlockType.HEADING]: 'Scene Heading',
  [BlockType.ACTION]: 'Action',
  [BlockType.DIALOGUE]: 'Dialogue',
  [BlockType.TRANSITION]: 'Transition'
};

export const RewriteComposerPopover: React.FC<RewriteComposerPopoverProps> = ({
  blockType,
  snippet,
  instructions,
  onInstructionsChange,
  candidateText,
  onGenerate,
  onApply,
  onCancel,
  isGenerating,
  errorMessage
}) => {
  const hasCandidate = candidateText.trim().length > 0;

  return (
    <div
      data-rewrite-composer="true"
      role="dialog"
      aria-label="Rewrite Block"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="rounded-xl border border-gray-300/80 bg-[#f6f1e7]/95 p-3 shadow-[0_16px_38px_rgba(0,0,0,0.18)] transition-[opacity,transform] duration-200 ease-out"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">Rewrite Block</h3>
        {isGenerating && <span className="text-[10px] text-gray-500">Generating...</span>}
      </div>

      <div className="mt-2 rounded-lg border border-gray-300 bg-white/85 px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          {BLOCK_LABELS[blockType]}
        </p>
        <p className="mt-1 text-xs text-gray-700 truncate">
          {snippet}
        </p>
      </div>

      <div className="mt-2 space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          Rewrite Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Make it funnier, Shorten, More suspense..."
          className="h-24 w-full resize-none rounded-lg border border-gray-300 bg-white/95 p-2 text-sm text-gray-800 shadow-inner outline-none transition-[opacity,transform] duration-150 ease-out placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          disabled={isGenerating}
        />
      </div>

      {hasCandidate && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
            Proposed Rewrite
          </p>
          <div className="max-h-28 overflow-y-auto rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-2 text-sm text-indigo-950 whitespace-pre-wrap">
            {candidateText}
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-xs text-red-700" role="alert">{errorMessage}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isGenerating}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onApply}
          disabled={isGenerating || !hasCandidate}
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onGenerate}
          loading={isGenerating}
        >
          Generate Rewrite
        </Button>
      </div>
    </div>
  );
};
