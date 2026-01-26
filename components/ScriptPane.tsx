import React, { useState } from 'react';
import { StoryContext, ScriptBlock } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { ScriptEditor } from './ScriptEditor';
import { InsertBlock } from './InsertBlock';
import { Button } from './Button';
import { AlertCircle, Loader2, Sparkles, PlusCircle } from 'lucide-react';

interface InsertTarget {
  sceneId: string;
  blockId: string;
}

interface ScriptPaneProps {
  context: StoryContext | null;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onTitleChange: (title: string) => void;
  onClearDraft: () => void;
  autosaveError: string | null;
  error: string | null;
  userInstruction: string;
  onInstructionChange: (value: string) => void;
  onGenerateNext: () => void;
  onPlotTwist: () => void;
  onAddBlock: (block: ScriptBlock) => void;
  onUndo: () => void;
  insertTarget: InsertTarget | null;
  onInsertAfter: (target: InsertTarget, block: ScriptBlock) => void;
  onCancelInsertTarget: () => void;
  onSelectInsertTarget: (target: InsertTarget) => void;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  onInsertError: (error: unknown) => void;
  onRegenerate: (sceneId: string, blockId: string) => void;
  onToggleLock: (sceneId: string, blockId: string) => void;
  isGenerating: boolean;
  isPlaying: boolean;
  isRegenerating: boolean;
  onCancelGenerate: () => void;
  currentBlockId: string | null;
  currentBlockIndex: number;
  blockStatuses: Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>;
  showHighlights: boolean;
  autoScroll: boolean;
  onOpenPrivacy: () => void;
}

type ViewMode = 'write' | 'preview' | 'split';

const PROMPT_CHAR_LIMIT = 320;
const VIEW_OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'write', label: 'Write' },
  { mode: 'preview', label: 'Preview' },
  { mode: 'split', label: 'Split' }
];

const getDefaultViewMode = (): ViewMode => {
  if (typeof window !== 'undefined' && window.innerWidth >= 1200) {
    return 'split';
  }
  return 'write';
};

export const ScriptPane: React.FC<ScriptPaneProps> = ({
  context,
  titleInputRef,
  onTitleChange,
  onClearDraft,
  autosaveError,
  error,
  userInstruction,
  onInstructionChange,
  onGenerateNext,
  onPlotTwist,
  onAddBlock,
  onUndo,
  insertTarget,
  onInsertAfter,
  onCancelInsertTarget,
  onSelectInsertTarget,
  onChangeSpeaker,
  onInsertError,
  onRegenerate,
  onToggleLock,
  isGenerating,
  isPlaying,
  isRegenerating,
  onCancelGenerate,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  showHighlights,
  autoScroll,
  onOpenPrivacy
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(getDefaultViewMode);
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const insertHandler = insertTarget ? (block: ScriptBlock) => onInsertAfter(insertTarget, block) : onAddBlock;
  const previewWidthClass = viewMode === 'preview' ? 'max-w-none w-full' : 'w-full';
  const generationIndicator = isGenerating ? (
    <div className="text-center text-gray-400 animate-pulse flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      <span className="text-sm font-medium">Running writers room simulation...</span>
      <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
        Cancel
      </Button>
    </div>
  ) : null;
  const writeSections = context ? (
    <>
      <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Next Scene Prompt</h3>
          <span className={`text-[10px] ${promptWarning ? 'text-amber-400' : 'text-gray-500'}`}>
            {promptCount}/{PROMPT_CHAR_LIMIT} chars
          </span>
        </div>
        <textarea
          value={userInstruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder="Suggest an action, or leave empty for AI to decide..."
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm h-28 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-600 shadow-inner"
        />
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <p>
            Keep prompts concise for faster responses.{' '}
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Privacy
            </button>
          </p>
          {promptWarning && <span>Trim prompts to reduce latency.</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={onPlotTwist}
            variant="secondary"
            size="sm"
            disabled={isGenerating}
            title="Generate a plot twist"
          >
            <Sparkles className="w-3 h-3 mr-2" />
            Plot Twist
          </Button>
          <Button
            onClick={onGenerateNext}
            loading={isGenerating}
            disabled={isPlaying}
            className="shadow-lg shadow-indigo-500/20"
            title="Generate the next scene"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Generate Next
          </Button>
        </div>
      </section>

      <ScriptEditor
        characters={context.characters}
        genre={context.genre}
        onAddBlock={onAddBlock}
        onUndo={onUndo}
        onError={onInsertError}
        disabled={isPlaying || isGenerating}
      />

      <section className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Insert Block</h3>
          {insertTarget && (
            <button
              type="button"
              onClick={onCancelInsertTarget}
              className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300"
            >
              Cancel insert
            </button>
          )}
        </div>
        <InsertBlock
          characters={context.characters}
          genre={context.genre}
          onAddBlock={insertHandler}
          onUndo={onUndo}
          onError={onInsertError}
          disabled={isPlaying || isGenerating}
          insertTarget={insertTarget}
        />
      </section>
    </>
  ) : null;
  const previewSection = context ? (
    <ScriptDisplay
      scenes={context.scenes}
      currentBlockId={currentBlockId}
      currentBlockIndex={currentBlockIndex}
      blockStatuses={blockStatuses}
      showHighlights={showHighlights}
      autoScroll={autoScroll}
      onRegenerate={onRegenerate}
      onToggleLock={onToggleLock}
      onSelectInsertTarget={onSelectInsertTarget}
      onChangeSpeaker={onChangeSpeaker}
      characters={context.characters}
      insertTarget={insertTarget}
      isRegenerating={isRegenerating}
      className={previewWidthClass}
    />
  ) : null;

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-[#1a1a1a]">
      <div className="border-b border-gray-800 bg-gray-900/40">
        <div className="max-w-6xl mx-auto px-6 py-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Script Seance</p>
              <h1 className="text-xl font-semibold text-white">Script Workspace</h1>
            </div>
            <div className="text-[11px] text-gray-400 flex items-center gap-3">
              <span>{context ? `${context.genre} / ${context.scenes.length} scenes` : 'No script yet'}</span>
              <button
                type="button"
                onClick={onClearDraft}
                disabled={!context}
                className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Clear draft
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block tracking-widest mb-1">Script Title</label>
              <input
                ref={titleInputRef}
                value={context?.title ?? ''}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Title of your masterpiece..."
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 text-white font-medium outline-none transition-shadow disabled:opacity-60"
                disabled={!context}
              />
              <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                <span>Draft autosaves locally.</span>
                {autosaveError && <span className="text-amber-400">{autosaveError}</span>}
              </div>
            </div>
            <div className="flex md:justify-end">
              <div
                className="inline-flex items-center bg-gray-950/70 border border-gray-800 rounded-lg p-1"
                role="group"
                aria-label="Script view"
              >
                {VIEW_OPTIONS.map((option) => {
                  const isActive = viewMode === option.mode;
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setViewMode(option.mode)}
                      aria-pressed={isActive}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
                        isActive
                          ? 'bg-gray-700 text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {error && (
            <div className="bg-red-900/40 border border-red-500/60 text-red-200 p-4 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{error}</p>
                {rateLimitHint && (
                  <p className="text-[11px] text-red-200/70">Rate limits reset after a short wait. Try again in ~30s.</p>
                )}
              </div>
            </div>
          )}

          {!context && (
            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
              <p className="text-lg font-semibold text-white">Your script will appear here.</p>
              <p className="text-sm text-gray-500">Start in Setup to generate the opening scene.</p>
            </div>
          )}

          {context && viewMode === 'write' && (
            <div className="space-y-6">
              {writeSections}
              {generationIndicator}
            </div>
          )}

          {context && viewMode === 'preview' && (
            <div className="space-y-6">
              {previewSection}
            </div>
          )}

          {context && viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
              <div className="space-y-6">
                {writeSections}
                {generationIndicator}
              </div>
              <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
                {previewSection}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
