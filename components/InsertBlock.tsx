import React, { useState } from 'react';
import { BlockType, ScriptBlock } from '../types';
import { Button } from './Button';
import { generateScriptElement } from '../services/gemini';
import { Zap, Plus, Undo2, Info } from 'lucide-react';

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
  const [mode, setMode] = useState<'write' | 'generate'>('write');
  const [elementType, setElementType] = useState<BlockType>(BlockType.ACTION);
  const [selectedChar, setSelectedChar] = useState(characters[0] || 'Unknown');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    let finalText = content;
    const blockType = elementType;
    const char = selectedChar;

    if (mode === 'generate') {
      setIsGenerating(true);
      try {
        finalText = await generateScriptElement(elementType, selectedChar, content, genre);
      } catch (e) {
        console.error("Generation failed", e);
        onError?.(e);
        return; 
      } finally {
        setIsGenerating(false);
      }
    }

    const newBlock: ScriptBlock = {
      id: crypto.randomUUID(),
      type: blockType,
      text: finalText,
      character: blockType === BlockType.DIALOGUE ? char : undefined
    };

    onAddBlock(newBlock);
    setContent(''); 
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Plus className="w-3 h-3" />
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

          <div className="flex bg-gray-900 border border-gray-700 rounded-md p-1">
            <button
              onClick={() => setMode('write')}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-colors ${mode === 'write' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Write
            </button>
            <button
              onClick={() => setMode('generate')}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-colors flex items-center gap-1 ${mode === 'generate' ? 'bg-indigo-900 text-indigo-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Zap className="w-2.5 h-2.5" />
              AI
            </button>
          </div>
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
          <p className="text-[10px] text-gray-500 italic flex items-center gap-1.5 px-1">
            <Info className="w-3 h-3" />
            {HINTS[elementType]}
          </p>
        </div>

        <div className="space-y-1.5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={mode === 'write' ? "Type content here..." : "Describe what should happen..."}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm h-24 focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-gray-600 shadow-inner"
          />
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={disabled || isGenerating || !content.trim()} 
          className="w-full shadow-lg"
          size="md"
          variant={mode === 'generate' ? 'accent' : 'primary'}
          loading={isGenerating}
          title={mode === 'write' ? 'Insert the block into your script' : 'Generate and insert the block'}
        >
          {mode === 'write' ? (
            <><Plus className="w-4 h-4 mr-2" /> Add Block</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" /> AI Generate & Add</>
          )}
        </Button>
      </div>
    </div>
  );
};
