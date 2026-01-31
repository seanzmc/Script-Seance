import React, { useState } from 'react';
import { BlockType, ScriptBlock } from '../types';
import { Button } from './Button';
import { generateScriptElement } from '../services/gemini';
import { PenTool, Zap, Plus, Undo2 } from 'lucide-react';

export interface ScriptEditorProps {
  characters: string[];
  genre: string;
  onAddBlock: (block: ScriptBlock) => void;
  onUndo?: () => void;
  onError?: (error: unknown) => void;
  disabled?: boolean;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ 
  characters, 
  genre, 
  onAddBlock,
  onUndo,
  onError,
  disabled 
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
        return; // Don't add if failed
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
    setContent(''); // Clear input
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <PenTool className="w-4 h-4" />
          Script Editor
        </h3>
        
        <div className="flex gap-2">
          {onUndo && (
             <button
              onClick={onUndo}
              disabled={disabled}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Undo last action"
             >
               <Undo2 className="w-4 h-4" />
             </button>
          )}

          {/* Mode Toggle */}
          <div className="flex bg-gray-900 rounded-md p-1">
            <button
              onClick={() => setMode('write')}
              className={`px-2 py-1 text-xs rounded transition-colors ${mode === 'write' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              title="Manual Write"
            >
              Write
            </button>
            <button
              onClick={() => setMode('generate')}
              className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${mode === 'generate' ? 'bg-indigo-900 text-indigo-100' : 'text-gray-400 hover:text-gray-300'}`}
              title="AI Generate"
            >
              <Zap className="w-3 h-3" />
              Auto
            </button>
          </div>
        </div>
      </div>

      {/* Type Selector */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={elementType}
          onChange={(e) => setElementType(e.target.value as BlockType)}
          className="bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-2 focus:ring-1 focus:ring-indigo-500 w-full"
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
            className="bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-2 focus:ring-1 focus:ring-indigo-500 w-full"
          >
            {characters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Input */}
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={mode === 'write' ? "Type content here..." : "Describe what should happen..."}
          className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm h-20 focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      </div>

      {/* Submit */}
      <Button 
        onClick={handleSubmit} 
        disabled={disabled || isGenerating || !content.trim()} 
        className="w-full"
        size="sm"
        variant={mode === 'generate' ? 'accent' : 'primary'}
        loading={isGenerating}
      >
        {mode === 'write' ? (
          <><Plus className="w-3 h-3 mr-2" /> Add to Script</>
        ) : (
          <><Zap className="w-3 h-3 mr-2" /> Generate & Add</>
        )}
      </Button>
    </div>
  );
};
