import React from 'react';
import { BlockType } from '../types';
import { Button } from './Button';
import {
  paperPopoverActionsClassName,
  paperPopoverAnimatedFieldClassName,
  paperPopoverAnimatedShellClassName,
  paperPopoverErrorClassName,
  paperPopoverLabelClassName,
  paperPopoverStatusTextClassName,
  paperPopoverTextAreaClassName,
  paperPopoverTitleClassName
} from './paperPopoverStyles';

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
  showPlacementControls?: boolean;
  placement?: 'before' | 'after';
  onPlacementChange?: (next: 'before' | 'after') => void;
}

const BLOCK_TYPE_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: BlockType.ACTION, label: 'Action' },
  { type: BlockType.HEADING, label: 'Scene Heading' },
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
  errorMessage,
  showPlacementControls = false,
  placement = 'after',
  onPlacementChange
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
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className={`w-[min(30rem,calc(100vw-2rem))] ${paperPopoverAnimatedShellClassName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className={paperPopoverTitleClassName}>Insert Block</h3>
        {isGenerating && <span className={paperPopoverStatusTextClassName}>Generating...</span>}
      </div>

      {showPlacementControls && onPlacementChange && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white/70 p-2.5 shadow-inner">
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
            Placement
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['before', 'after'] as const).map((option) => {
              const isSelected = placement === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onPlacementChange(option)}
                  className={`min-h-[40px] rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700'
                  }`}
                >
                  Insert {option === 'before' ? 'Before' : 'After'}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
              className={`min-h-[42px] rounded-xl border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-500 text-white shadow-[0_5px_14px_rgba(79,70,229,0.32)]'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {isDialogueType && (
        <div className="mt-2.5 space-y-1">
          <label className={paperPopoverLabelClassName}>
            Character
          </label>
          {hasCharacters ? (
            <select
              value={selectedCharacter}
              onChange={(event) => onCharacterChange(event.target.value)}
              className={paperPopoverAnimatedFieldClassName}
              disabled={isGenerating}
              aria-label="Character"
            >
              {characters.map((character) => (
                <option key={character} value={character}>{character}</option>
              ))}
            </select>
          ) : (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Add a character first
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 space-y-1">
        <label className={paperPopoverLabelClassName}>
          Content (Optional)
        </label>
        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="Leave blank and use Generate and Insert, or type the block you want inserted."
          className={paperPopoverTextAreaClassName}
          disabled={isGenerating}
        />
      </div>

      {errorMessage && (
        <p className={paperPopoverErrorClassName} role="alert">{errorMessage}</p>
      )}

      <div className={paperPopoverActionsClassName}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onInsert}
          disabled={disableActions}
        >
          Insert as written
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onGenerate}
          disabled={disableActions}
          loading={isGenerating}
        >
          Generate and Insert
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isGenerating}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};
