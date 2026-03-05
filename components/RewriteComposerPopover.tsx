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
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-[#d6cdbd] bg-[#f6f1e7] p-4 shadow-[0_20px_54px_rgba(15,23,42,0.24)] transition-[opacity,transform,box-shadow] duration-200 ease-out"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-800">Rewrite Block</h3>
        {isGenerating && <span className="text-xs text-gray-600">Generating...</span>}
      </div>

      <div className="mt-3 rounded-xl border border-gray-300 bg-white px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          {BLOCK_LABELS[blockType]}
        </p>
        <p className="mt-1 text-sm text-gray-700 truncate">
          {snippet}
        </p>
      </div>

      <div className="mt-2.5 space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          Rewrite Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Make it funnier, Shorten, More suspense..."
          className="h-28 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-inner outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-gray-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          disabled={isGenerating}
        />
      </div>

      {hasCandidate && (
        <div className="mt-2.5 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
            Proposed Rewrite
          </p>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-950 whitespace-pre-wrap">
            {candidateText}
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-sm text-red-700" role="alert">{errorMessage}</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
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
