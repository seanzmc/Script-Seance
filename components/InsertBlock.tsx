import React, { useEffect, useState } from 'react';
import { BlockType, ScriptBlock } from '../types';
import { Button } from './Button';
import { generateScriptElement } from '../services/ai';

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
const resolveCharacterName = (value: string, characters: string[]) => {
  const normalized = normalizeCharacterName(value);
  return characters.find(char => normalizeCharacterName(char) === normalized) || value;
};
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
const toSingleSentence = (value: string) => {
  const compact = collapseWhitespace(value);
  if (!compact) return '';
  const sentenceMatch = compact.match(/^(.+?[.!?])(?:\s|$)/);
  return sentenceMatch?.[1]?.trim() || compact;
};
const removeDialogueSpeakerPrefix = (value: string, character: string) => {
  const escaped = escapeRegExp(character.trim());
  if (!escaped) return value.trim();

  const withColonRemoved = value.replace(new RegExp(`^${escaped}\\s*[:\\-–—]\\s*`, 'i'), '');
  const lines = withColonRemoved
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const firstLineNormalized = normalizeCharacterName(lines[0]);
    if (firstLineNormalized === normalizeCharacterName(character)) {
      return lines.slice(1).join(' ');
    }
  }
  return lines.join(' ');
};
const sanitizeGeneratedDialogue = (rawText: string, character: string) => {
  const withoutSpeaker = removeDialogueSpeakerPrefix(rawText, character);
  const noQuotes = withoutSpeaker.replace(/^["'“”]+|["'“”]+$/g, '');
  return collapseWhitespace(noQuotes);
};
const looksLikeTransition = (line: string) =>
  /^(CUT TO|SMASH CUT TO|MATCH CUT TO|DISSOLVE TO|FADE IN|FADE OUT|WIPE TO|JUMP CUT TO)\b/i.test(line) ||
  /:\s*$/.test(line);
const looksLikeSpeakerLabel = (line: string) =>
  /^[A-Z][A-Z0-9 .'\-()]{1,40}$/.test(line) || /^[A-Z][A-Z0-9 .'\-()]{1,40}\s*:/.test(line);
const sanitizeGeneratedAction = (rawText: string) => {
  const lines = rawText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const filtered = lines.filter(line => !looksLikeTransition(line) && !looksLikeSpeakerLabel(line));
  const base = filtered[0] || lines[0] || '';
  return toSingleSentence(base);
};
const sanitizeGeneratedText = (type: BlockType, rawText: string, character: string) => {
  if (type === BlockType.DIALOGUE) {
    return sanitizeGeneratedDialogue(rawText, character);
  }
  if (type === BlockType.ACTION) {
    return sanitizeGeneratedAction(rawText);
  }
  if (type === BlockType.TRANSITION || type === BlockType.HEADING) {
    return rawText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)[0] || '';
  }
  return collapseWhitespace(rawText);
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
  [BlockType.ACTION]: "One visual action beat.",
  [BlockType.DIALOGUE]: "One spoken line.",
  [BlockType.TRANSITION]: "One transition cue.",
  [BlockType.HEADING]: "One scene heading."
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
  const labelClass = 'text-[10px] uppercase font-bold text-gray-400 tracking-widest';
  const selectClass = 'h-9 bg-gray-950 border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 focus:ring-1 focus:ring-indigo-500 w-full outline-none appearance-none';
  const textareaClass = 'w-full h-full min-h-[72px] bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-gray-600 shadow-inner';
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
    const instruction = buildSurpriseInstruction(elementType, content, selectedChar);

    try {
      const promptContext = styleContext?.trim() ? styleContext : genre;
      const generatedText = await generateScriptElement(
        elementType,
        selectedChar,
        instruction,
        promptContext
      );
      const sanitized = sanitizeGeneratedText(elementType, generatedText, selectedChar);
      if (!sanitized) return;
      setContent(sanitized);
    } catch (e) {
      console.error("Generation failed", e);
      onError?.(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
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
          disabled={disabled || isGenerating}
          size="sm"
          variant="secondary"
          loading={isGenerating}
          className="w-full lg:w-auto whitespace-nowrap lg:self-end"
          title="Generate a new block in the editor"
        >
          Surprise
        </Button>
        {insertTarget && (
          <p className={`text-[10px] text-indigo-300 ${elementType === BlockType.DIALOGUE ? 'md:col-span-2 lg:col-span-3' : 'lg:col-span-2'}`}>
            Insertion point selected.
          </p>
        )}
      </div>

      <div className="grid grid-rows-[auto_minmax(0,1fr)] gap-1 flex-1 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
          <label className={labelClass}>Content</label>
          <p className="text-[10px] leading-snug text-gray-500 italic sm:text-right sm:max-w-[55%]">{HINTS[elementType]}</p>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your block content here..."
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1 min-w-0">
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
          <div className="flex flex-col gap-1 min-w-0">
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
