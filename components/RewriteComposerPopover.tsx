import React from 'react';
import { BlockType } from '../types';
import { Button } from './Button';
import {
  paperPopoverActionsClassName,
  paperPopoverAnimatedShellClassName,
  paperPopoverErrorClassName,
  paperPopoverLabelClassName,
  paperPopoverStatusTextClassName,
  paperPopoverTextAreaClassName,
  paperPopoverTitleClassName
} from './paperPopoverStyles';

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
      className={`w-[min(30rem,calc(100vw-2rem))] ${paperPopoverAnimatedShellClassName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className={paperPopoverTitleClassName}>Rewrite Block</h3>
        {isGenerating && <span className={paperPopoverStatusTextClassName}>Generating...</span>}
      </div>

      <div className="mt-3 rounded-xl border border-gray-300 bg-white px-3 py-2.5">
        <p className={paperPopoverLabelClassName}>
          {BLOCK_LABELS[blockType]}
        </p>
        <p className="mt-1 text-sm text-gray-700 truncate">
          {snippet}
        </p>
      </div>

      <div className="mt-2.5 space-y-1">
        <label className={paperPopoverLabelClassName}>
          Rewrite Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Make it funnier, Shorten, More suspense..."
          className={paperPopoverTextAreaClassName}
          disabled={isGenerating}
        />
      </div>

      {hasCandidate && (
        <div className="mt-2.5 space-y-1">
          <p className={paperPopoverLabelClassName}>
            Proposed Rewrite
          </p>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-950 whitespace-pre-wrap">
            {candidateText}
          </div>
        </div>
      )}

      {errorMessage && (
        <p className={paperPopoverErrorClassName} role="alert">{errorMessage}</p>
      )}

      <div className={paperPopoverActionsClassName}>
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
