import React, { useEffect, useState } from 'react';
import { BlockType, ScriptAnchor, ScriptBlock } from '../types';
import { createBlock } from '../domain/blocks';
import { Button } from './Button';

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
const resolveCharacterName = (value: string, characters: string[]) => {
  const normalized = normalizeCharacterName(value);
  return characters.find(char => normalizeCharacterName(char) === normalized) || value;
};
const buildSurpriseInstruction = (
  type: BlockType,
  baseInstruction: string,
  character: string
) => {
  const trimmed = baseInstruction.trim();
  if (trimmed) return trimmed;
  if (type === BlockType.DIALOGUE) {
    return `Write exactly one line of dialogue for "${character}". Output only the spoken words; do not include the character name, parentheticals, or extra lines.`;
  }
  if (type === BlockType.ACTION) {
    return 'Write exactly one screenplay action line. Do not include dialogue, character labels, scene headings, or transitions.';
  }
  if (type === BlockType.TRANSITION) {
    return 'Write exactly one screenplay transition.';
  }
  return 'Write exactly one scene heading (slugline) in screenplay format.';
};

export interface InsertBlockProps {
  characters: string[];
  sceneEndAnchor: ScriptAnchor | null;
  onInsertAtAnchor?: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  onGenerateInsertAtAnchor?: (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => Promise<void>;
  insertCompleteToken: number;
  onError?: (error: unknown) => void;
  disabled?: boolean;
}

const HINTS: Record<BlockType, string> = {
  [BlockType.ACTION]: "One visual action beat.",
  [BlockType.DIALOGUE]: "One spoken line.",
  [BlockType.TRANSITION]: "One transition cue.",
  [BlockType.HEADING]: "One scene heading."
};

export const InsertBlock: React.FC<InsertBlockProps> = ({ 
  characters,
  sceneEndAnchor,
  onInsertAtAnchor,
  onGenerateInsertAtAnchor,
  insertCompleteToken,
  onError,
  disabled
}) => {
  const labelClass = 'text-[11px] uppercase font-bold text-gray-300 tracking-[0.18em]';
  const selectClass = 'h-11 bg-gray-950 border border-gray-700 text-gray-100 text-sm rounded-xl px-3 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none';
  const textareaClass = 'w-full min-h-[116px] bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-gray-500 shadow-inner';
  const [elementType, setElementType] = useState<BlockType>(BlockType.ACTION);
  const [selectedChar, setSelectedChar] = useState(characters[0] || 'Unknown');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => {
    if (!tooltip) return;
    const timer = setTimeout(() => setTooltip(null), 1600);
    return () => clearTimeout(timer);
  }, [tooltip]);

  useEffect(() => {
    if (insertCompleteToken > 0) {
      setContent('');
    }
  }, [insertCompleteToken]);

  useEffect(() => {
    if (!characters.length) return;
    const normalizedSelected = normalizeCharacterName(selectedChar);
    const match = characters.find(char => normalizeCharacterName(char) === normalizedSelected);
    if (!match) {
      setSelectedChar(characters[0]);
      return;
    }
    if (match !== selectedChar) {
      setSelectedChar(match);
    }
  }, [characters, selectedChar]);

  const showTooltip = (message: string) => {
    setTooltip(message);
  };

  const buildBlock = (trimmedContent: string): ScriptBlock => createBlock({
    type: elementType,
    text: trimmedContent,
    character: elementType === BlockType.DIALOGUE ? resolveCharacterName(selectedChar, characters) : undefined
  });

  const handleAddToEnd = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      showTooltip('Add content first');
      return;
    }
    if (disabled || isGenerating || !sceneEndAnchor || !onInsertAtAnchor) return;
    onInsertAtAnchor(sceneEndAnchor, buildBlock(trimmedContent));
    setContent(''); 
  };

  const handleSurpriseMe = async () => {
    if (disabled || isGenerating || !onGenerateInsertAtAnchor || !sceneEndAnchor) return;
    setIsGenerating(true);
    const requestType = elementType;
    const requestCharacter = resolveCharacterName(selectedChar, characters);
    const instruction = buildSurpriseInstruction(requestType, content, requestCharacter);

    try {
      await onGenerateInsertAtAnchor({
        anchor: sceneEndAnchor,
        type: requestType,
        content: instruction,
        character: requestType === BlockType.DIALOGUE ? requestCharacter : undefined
      });
      setContent('');
    } catch (e: unknown) {
      console.error('Generation failed', e);
      onError?.(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    // ToolPanelShell owns scrolling; keep tool roots overflow-free unless absolutely required.
    <div className="flex flex-col gap-2">
      <div
        className={`grid gap-2 ${
          elementType === BlockType.DIALOGUE
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
            : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]'
        }`}
      >
        <div className="space-y-1">
          <label className={labelClass}>Type</label>
          <select
            value={elementType}
            onChange={(e) => setElementType(e.target.value as BlockType)}
            className={selectClass}
          >
            <option value={BlockType.ACTION}>Action</option>
            <option value={BlockType.DIALOGUE}>Dialogue</option>
            <option value={BlockType.TRANSITION}>Transition</option>
            <option value={BlockType.HEADING}>New Scene</option>
          </select>
        </div>
        {elementType === BlockType.DIALOGUE && (
          <div className="space-y-1">
            <label className={labelClass}>Character</label>
            <select
              value={selectedChar}
              onChange={(e) => setSelectedChar(e.target.value)}
              className={selectClass}
            >
              {characters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <Button
          onClick={handleSurpriseMe}
          disabled={disabled || isGenerating || !onGenerateInsertAtAnchor || !sceneEndAnchor}
          size="sm"
          variant="secondary"
          loading={isGenerating}
          className="w-full lg:w-auto whitespace-nowrap lg:self-end"
          title="Generate and insert one block at the end of your script"
        >
          Generate and Insert
        </Button>
      </div>

      <div className="grid gap-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
          <label className={labelClass}>Content</label>
          <p className="text-xs leading-snug text-gray-400 italic sm:text-right sm:max-w-[55%]">{HINTS[elementType]}</p>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your block content here..."
          className={textareaClass}
        />
        <p className="text-xs text-gray-500">
          “Surprise” generates one block and inserts it directly into the script.
        </p>
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1 min-w-0">
            <Button
              onClick={handleAddToEnd}
              disabled={disabled || isGenerating || !onInsertAtAnchor || !sceneEndAnchor}
              className="w-full"
              size="sm"
              variant="secondary"
              title="Insert this block at the end of your script"
            >
              Add to End
            </Button>
          </div>
          <p className="text-xs leading-snug text-gray-500 sm:self-center">
            Use inline <span className="font-semibold text-gray-400">+</span> slots in the script to insert at specific points.
          </p>
        </div>
        {tooltip && (
          <span className="text-xs text-amber-300">{tooltip}</span>
        )}
      </div>
    </div>
  );
};
