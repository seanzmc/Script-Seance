import React from 'react';
import { BlockType } from '../types';
import { Button } from './Button';

export interface InsertComposerPopoverProps {
  blockType: BlockType;
  onBlockTypeChange: (next: BlockType) => void;
  characters: string[];
  selectedCharacter: string;
  onCharacterChange: (next: string) => void;
  content: string;
  onContentChange: (next: string) => void;
  onGenerate: () => void;
  onInsert: () => void;
  onCancel: () => void;
  onGenerateNextScene?: () => void;
  isGenerating: boolean;
  isGeneratingNextScene?: boolean;
  showGenerateNextSceneAction?: boolean;
  generateNextSceneDisabled?: boolean;
  actionsDisabled?: boolean;
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
  characters,
  selectedCharacter,
  onCharacterChange,
  content,
  onContentChange,
  onGenerate,
  onInsert,
  onCancel,
  onGenerateNextScene,
  isGenerating,
  isGeneratingNextScene = false,
  showGenerateNextSceneAction = false,
  generateNextSceneDisabled = false,
  actionsDisabled = false,
  errorMessage
}) => {
  const isDialogueType = blockType === BlockType.DIALOGUE;
  const hasCharacters = characters.length > 0;
  const dialogueUnavailable = isDialogueType && !hasCharacters;
  const disableActions = isGenerating || actionsDisabled || dialogueUnavailable;
  const disableGenerateNextScene = isGenerating || generateNextSceneDisabled || !onGenerateNextScene;

  return (
    <div
      data-insert-composer="true"
      role="dialog"
      aria-label="Insert Block"
      className="rounded-xl border border-gray-300/85 bg-[#f6f1e7]/97 p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.2)] backdrop-blur-[1px] transition-[opacity,transform,box-shadow] duration-200 ease-out"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">Insert Block</h3>
        {isGenerating && <span className="text-[10px] text-gray-500">Generating...</span>}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5" role="tablist" aria-label="Block type">
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
              className={`min-h-[31px] rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-500 text-white shadow-[0_5px_14px_rgba(79,70,229,0.32)]'
                  : 'border-gray-300/80 bg-white/85 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {isDialogueType && (
        <div className="mt-2.5 space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
            Character
          </label>
          {hasCharacters ? (
            <select
              value={selectedCharacter}
              onChange={(event) => onCharacterChange(event.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white/95 px-2.5 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              disabled={isGenerating}
              aria-label="Character"
            >
              {characters.map((character) => (
                <option key={character} value={character}>{character}</option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50/85 px-2.5 py-2 text-xs text-amber-800">
              Add a character first
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          Content (Optional)
        </label>
        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="Leave blank and use Generate, or type your own block content..."
          className="h-24 w-full resize-none rounded-lg border border-gray-300 bg-white/95 p-2 text-sm text-gray-800 shadow-inner outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          disabled={isGenerating}
        />
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs text-red-700" role="alert">{errorMessage}</p>
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
          onClick={onInsert}
          disabled={disableActions}
        >
          Insert
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onGenerate}
          disabled={disableActions}
          loading={isGenerating}
        >
          Generate
        </Button>
        {showGenerateNextSceneAction && (
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={onGenerateNextScene}
            disabled={disableGenerateNextScene}
            loading={isGeneratingNextScene}
          >
            Generate Next Scene
          </Button>
        )}
      </div>
    </div>
  );
};
