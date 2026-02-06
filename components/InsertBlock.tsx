import React, { useEffect, useState } from 'react';
import { BlockType, ScriptBlock } from '../types';
import { Button } from './Button';
import { generateScriptElement } from '../services/gemini';
import { PenTool } from 'lucide-react';

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
const resolveCharacterName = (value: string, characters: string[]) => {
  const normalized = normalizeCharacterName(value);
  return characters.find(char => normalizeCharacterName(char) === normalized) || value;
};

export interface InsertBlockProps {
  characters: string[];
  genre: string;
  onAddBlock: (block: ScriptBlock) => void;
  onStartInsertMode: (block: ScriptBlock) => void;
  insertModeActive: boolean;
  insertCompleteToken: number;
  onError?: (error: unknown) => void;
  disabled?: boolean;
  insertTarget?: { sceneId: string; blockId: string } | null;
  styleContext?: string;
}

const HINTS: Record<BlockType, string> = {
  [BlockType.ACTION]: "Describes physical movement, setting details, or non-verbal events.",
  [BlockType.DIALOGUE]: "The spoken words of a character, including tone instructions.",
  [BlockType.TRANSITION]: "Cinematic indicators like CUT TO: or FADE OUT:.",
  [BlockType.HEADING]: "Starts a new scene with location and time (e.g. INT. OFFICE - DAY)."
};

export const InsertBlock: React.FC<InsertBlockProps> = ({ 
  characters, 
  genre, 
  onAddBlock,
  onStartInsertMode,
  insertModeActive,
  insertCompleteToken,
  onError,
  disabled,
  insertTarget,
  styleContext
}) => {
  const [elementType, setElementType] = useState<BlockType>(BlockType.ACTION);
  const [selectedChar, setSelectedChar] = useState(characters[0] || 'Unknown');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tooltip, setTooltip] = useState<{ message: string; anchor: 'add' | 'insert' } | null>(null);
  const addMessage = tooltip?.anchor === 'add' ? tooltip.message : null;
  const insertMessage = tooltip?.anchor === 'insert' ? tooltip.message : null;

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

  const showTooltip = (message: string, anchor: 'add' | 'insert') => {
    setTooltip({ message, anchor });
  };

  const buildBlock = (trimmedContent: string): ScriptBlock => ({
    id: crypto.randomUUID(),
    type: elementType,
    text: trimmedContent,
    character: elementType === BlockType.DIALOGUE ? resolveCharacterName(selectedChar, characters) : undefined
  });

  const handleAddBlock = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      showTooltip('Add content first', 'add');
      return;
    }
    if (disabled || isGenerating) return;

    onAddBlock(buildBlock(trimmedContent));
    setContent(''); 
  };

  const handleInsertMode = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      showTooltip('Add content first', 'insert');
      return;
    }
    if (disabled || isGenerating || insertModeActive) return;

    onStartInsertMode(buildBlock(trimmedContent));
  };

  const handleSurpriseMe = async () => {
    if (disabled || isGenerating) return;
    setIsGenerating(true);
    const instruction =
      content.trim() || `Surprise me with a ${elementType} block.`;

    try {
      const promptContext = styleContext?.trim() ? styleContext : genre;
      const generatedText = await generateScriptElement(
        elementType,
        selectedChar,
        instruction,
        promptContext
      );
      if (!generatedText.trim()) return;
      setContent(generatedText.trim());
    } catch (e) {
      console.error("Generation failed", e);
      onError?.(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2 uppercase tracking-[0.3em]">
          <PenTool className="w-4 h-4" />
          Insert Block
        </h3>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSurpriseMe}
            disabled={disabled || isGenerating}
            size="sm"
            variant="secondary"
            loading={isGenerating}
            title="Generate a new block in the editor"
          >
            Surprise
          </Button>
        </div>
      </div>

      {insertTarget && (
        <p className="text-[10px] text-indigo-300">
          Insertion point selected.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-3">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Type</label>
          <div className="space-y-2">
            <select
              value={elementType}
              onChange={(e) => setElementType(e.target.value as BlockType)}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none"
            >
              <option value={BlockType.ACTION}>Action</option>
              <option value={BlockType.DIALOGUE}>Dialogue</option>
              <option value={BlockType.TRANSITION}>Transition</option>
              <option value={BlockType.HEADING}>New Scene</option>
            </select>

            {elementType === BlockType.DIALOGUE && (
              <select
                value={selectedChar}
                onChange={(e) => setSelectedChar(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none"
              >
                {characters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <p className="text-[10px] text-gray-500 italic">
            {HINTS[elementType]}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your block content here..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm h-24 focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-gray-600 shadow-inner"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-gray-500">
          Add to the end or enter insert mode to pick a point in the script.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-end gap-2">
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <Button
              onClick={handleAddBlock}
              disabled={disabled || isGenerating}
              className="w-full"
              size="sm"
              variant="secondary"
              title="Add the block to the end of your script"
            >
              Add to End
            </Button>
            {addMessage && (
              <span className="text-[10px] text-amber-300">{addMessage}</span>
            )}
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto sm:items-end">
            <Button
              onClick={handleInsertMode}
              disabled={disabled || isGenerating || insertModeActive}
              className="w-full shadow-lg"
              size="sm"
              variant="primary"
              title="Pick an insertion point in the script"
            >
              Insert at Point
            </Button>
            {insertMessage && (
              <span className="text-[10px] text-amber-300">{insertMessage}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
