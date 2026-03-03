import React from 'react';
import { BlockType } from '../types';
import { Button } from './Button';

export interface InsertComposerPopoverProps {
  blockType: BlockType;
  onBlockTypeChange: (next: BlockType) => void;
  content: string;
  onContentChange: (next: string) => void;
  onGenerate: () => void;
  onInsert: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  errorMessage: string | null;
}

const BLOCK_TYPE_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: BlockType.HEADING, label: 'Scene Heading' },
  { type: BlockType.ACTION, label: 'Action' },
  { type: BlockType.DIALOGUE, label: 'Dialogue' },
  { type: BlockType.TRANSITION, label: 'Transition' }
];

export const InsertComposerPopover: React.FC<InsertComposerPopoverProps> = ({
  blockType,
  onBlockTypeChange,
  content,
  onContentChange,
  onGenerate,
  onInsert,
  onCancel,
  isGenerating,
  errorMessage
}) => {
  return (
    <div
      data-insert-composer="true"
      role="dialog"
      aria-label="Insert Block"
      className="rounded-xl border border-gray-300/80 bg-[#f6f1e7]/95 p-3 shadow-[0_16px_38px_rgba(0,0,0,0.18)] transition-[opacity,transform] duration-200 ease-out"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">Insert Block</h3>
        {isGenerating && <span className="text-[10px] text-gray-500">Generating...</span>}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1" role="tablist" aria-label="Block type">
        {BLOCK_TYPE_OPTIONS.map((option) => {
          const isSelected = option.type === blockType;
          return (
            <button
              key={option.type}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onBlockTypeChange(option.type)}
              disabled={isGenerating}
              className={`min-h-[30px] rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-[opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isSelected
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/80 text-gray-600 hover:opacity-90'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          Content (Optional)
        </label>
        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="Leave blank and use Generate, or type your own block content..."
          className="h-24 w-full resize-none rounded-lg border border-gray-300 bg-white/95 p-2 text-sm text-gray-800 shadow-inner outline-none transition-[opacity,transform] duration-150 ease-out placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          disabled={isGenerating}
        />
      </div>

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
          onClick={onInsert}
          disabled={isGenerating}
        >
          Insert
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onGenerate}
          loading={isGenerating}
        >
          Generate
        </Button>
      </div>
    </div>
  );
};
