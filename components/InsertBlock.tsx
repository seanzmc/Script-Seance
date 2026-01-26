import React, { useState } from 'react';
import { BlockType, ScriptBlock } from '../types';
import { Button } from './Button';
import { generateScriptElement } from '../services/gemini';
import { Undo2 } from 'lucide-react';

interface InsertBlockProps {
  characters: string[];
  genre: string;
  onAddBlock: (block: ScriptBlock) => void;
  onUndo?: () => void;
  onError?: (error: unknown) => void;
  disabled?: boolean;
  insertTarget?: { sceneId: string; blockId: string } | null;
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
  onUndo,
  onError,
  disabled,
  insertTarget
}) => {
  const [elementType, setElementType] = useState<BlockType>(BlockType.ACTION);
  const [selectedChar, setSelectedChar] = useState(characters[0] || 'Unknown');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAddBlock = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const blockType = elementType;
    const newBlock: ScriptBlock = {
      id: crypto.randomUUID(),
      type: blockType,
      text: trimmedContent,
      character: blockType === BlockType.DIALOGUE ? selectedChar : undefined
    };

    onAddBlock(newBlock);
    setContent(''); 
  };

  const handleSurpriseMe = async () => {
    if (disabled || isGenerating) return;
    setIsGenerating(true);
    const instruction =
      content.trim() || `Surprise me with a ${elementType} block.`;

    try {
      const generatedText = await generateScriptElement(
        elementType,
        selectedChar,
        instruction,
        genre
      );
      if (!generatedText.trim()) return;

      const newBlock: ScriptBlock = {
        id: crypto.randomUUID(),
        type: elementType,
        text: generatedText,
        character: elementType === BlockType.DIALOGUE ? selectedChar : undefined
      };

      onAddBlock(newBlock);
      setContent('');
    } catch (e) {
      console.error("Generation failed", e);
      onError?.(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Insert Block
        </h3>
        
        <div className="flex gap-2">
          {onUndo && (
             <button
              onClick={onUndo}
              disabled={disabled}
              className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
              title="Undo last action"
             >
               <Undo2 className="w-4 h-4" />
             </button>
          )}

        </div>
      </div>

      <div className="space-y-3">
        {insertTarget && (
          <p className="text-[10px] text-indigo-300">
            Inserting after the selected block.
          </p>
        )}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Block Type</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={elementType}
              onChange={(e) => setElementType(e.target.value as BlockType)}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none"
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
                className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none"
              >
                {characters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <p className="text-[10px] text-gray-500 italic px-1">
            {HINTS[elementType]}
          </p>
        </div>

        <div className="space-y-1.5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your block content here..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm h-24 focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-gray-600 shadow-inner"
          />
        </div>

        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">
            Add Block inserts what you wrote. Surprise me generates a new block using the selected type and genre (text optional).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button 
              onClick={handleAddBlock} 
              disabled={disabled || isGenerating || !content.trim()} 
              className="w-full shadow-lg sm:flex-1"
              size="md"
              variant="primary"
              title="Insert the block into your script"
            >
              Add Block
            </Button>
            <Button
              onClick={handleSurpriseMe}
              disabled={disabled || isGenerating}
              className="w-full sm:w-auto"
              size="sm"
              variant="secondary"
              loading={isGenerating}
              title="Generate a new block and insert it"
            >
              Surprise me
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
