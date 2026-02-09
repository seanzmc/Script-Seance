import React, { useEffect, useMemo, useState } from 'react';
import { StoryContext, ScriptBlock } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertBlock } from './InsertBlock';
import { Button } from './Button';
import { SetupForm, SetupFormState } from './SetupForm';
import { BottomToolbelt, ToolKey } from './BottomToolbelt';
import { TitleEditModal } from './TitleEditModal';
import { AlertCircle, Loader2, Sparkles, PlusCircle, X, Pencil, Undo2, Redo2 } from 'lucide-react';

export interface InsertTarget {
  sceneId: string;
  blockId: string;
}

export interface ScriptPaneProps {
  context: StoryContext | null;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onTitleChange: (title: string) => void;
  suggestedTitle: string | null;
  isSuggestingTitle: boolean;
  suggestedTitleDismissed: boolean;
  onUseSuggestedTitle: () => void;
  onDismissSuggestedTitle: () => void;
  onClearDraft: () => void;
  autosaveError: string | null;
  error: string | null;
  userInstruction: string;
  onInstructionChange: (value: string) => void;
  onGenerateNext: () => void;
  onPlotTwist: () => void;
  onAddBlock: (block: ScriptBlock) => void;
  onUndo: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  insertTarget: InsertTarget | null;
  insertModeActive: boolean;
  pendingInsertBlock: ScriptBlock | null;
  onStartInsertMode: (block: ScriptBlock) => void;
  onCancelInsertMode: () => void;
  onConfirmInsertMode: () => void;
  insertCompleteToken: number;
  onSelectInsertTarget: (target: InsertTarget) => void;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  onInsertError: (error: unknown) => void;
  onRegenerate: (sceneId: string, blockId: string, rewriteGuidance?: string) => void;
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
  onOpenSetup: () => void;
  isSetupOpen: boolean;
  onCloseSetup: () => void;
  setupState: SetupFormState;
  onSetupChange: (next: Partial<SetupFormState>) => void;
  onStartSetup: () => void;
  setupAutoSurprise: boolean;
  styleContext?: string;
  onSetupError?: (error: unknown, fallbackMessage: string) => boolean;
  onExportTxt: () => void;
  onExportPdf?: () => void;
  canExport: boolean;
  playbackContent?: React.ReactNode;
  voicesContent?: React.ReactNode;
  insertScrollTargetId: string | null;
  insertScrollToken: number;
}

const PROMPT_CHAR_LIMIT = 320;

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
  onRedo,
  canUndo,
  canRedo,
  insertTarget,
  insertModeActive,
  pendingInsertBlock,
  onStartInsertMode,
  onCancelInsertMode,
  onConfirmInsertMode,
  insertCompleteToken,
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
  onOpenPrivacy,
  onOpenSetup,
  isSetupOpen,
  onCloseSetup,
  setupState,
  onSetupChange,
  onStartSetup,
  setupAutoSurprise,
  styleContext,
  onSetupError,
  onExportTxt,
  onExportPdf,
  canExport,
  playbackContent,
  voicesContent,
  insertScrollTargetId,
  insertScrollToken
}) => {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [rewriteTarget, setRewriteTarget] = useState<{ sceneId: string; blockId: string } | null>(null);
  const [rewriteGuidance, setRewriteGuidance] = useState('');
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const isInsertModeView = insertModeActive && Boolean(context);
  const previewClassName = `w-full ${
    isInsertModeView ? 'ring-2 ring-indigo-400/60 shadow-[0_0_30px_rgba(79,70,229,0.25)]' : ''
  }`.trim();
  const genreLabel = context?.genre ?? 'Genre';
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
  const styleLabel = setupState.style.trim();
  const generationIndicator = isGenerating ? (
    <div className="text-center text-gray-400 animate-pulse flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      <span className="text-sm font-medium">Running writers room simulation...</span>
      <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
        Cancel
      </Button>
    </div>
  ) : null;
  const showStartScreen = !context && !isGenerating;
  const showInitialGeneration = !context && isGenerating;
  const errorBanner = error ? (
    <div className="bg-red-900/40 border border-red-500/60 text-red-200 p-4 rounded-lg flex items-start gap-2">
      <AlertCircle className="w-5 h-5 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{error}</p>
        {rateLimitHint && (
          <p className="text-[11px] text-red-200/70">Rate limits reset after a short wait. Try again in ~30s.</p>
        )}
      </div>
    </div>
  ) : null;

  const handleStartSetupClick = () => {
    onOpenSetup();
  };
  const startScreenCard = (
    <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-800 bg-gradient-to-b from-gray-900/80 via-gray-900/60 to-gray-900/30 p-10 md:p-12 text-center shadow-[0_0_60px_rgba(15,23,42,0.6)]">
      <div className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative space-y-5">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.6em] text-gray-500">Start Screen</p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">SCRIPT SEANCE</h1>
          <p className="text-sm md:text-base text-gray-400">
            Summon a writers room to draft cinematic scenes, one beat at a time.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={handleStartSetupClick}
            size="lg"
            className="w-full sm:w-auto px-8 text-base shadow-[0_0_35px_rgba(79,70,229,0.45)] hover:shadow-[0_0_50px_rgba(79,70,229,0.6)]"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Start a New Script
          </Button>
        </div>
      </div>
    </div>
  );
  const startGenerationCard = (
    <div className="w-full max-w-2xl rounded-3xl border border-indigo-500/30 bg-indigo-500/10 px-10 py-12 text-center space-y-4 shadow-[0_0_40px_rgba(79,70,229,0.2)]">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
      <div className="space-y-2">
        <p className="text-lg font-semibold text-white">Generating your opening scene...</p>
        <p className="text-sm text-indigo-100/70">Gathering the writers room and shaping the first beat.</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
        Cancel
      </Button>
    </div>
  );
  const generateContent = context ? (
    <div className="space-y-3">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Prompt</h3>
          <span className={`text-[10px] ${promptWarning ? 'text-amber-400' : 'text-gray-500'}`}>
            {promptCount}/{PROMPT_CHAR_LIMIT} chars
          </span>
        </div>
        <textarea
          value={userInstruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder="Suggest an action, or leave empty for AI to decide..."
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm h-20 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-600 shadow-inner"
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px] text-gray-500">
          <p className="flex items-center gap-2">
            <span>Keep prompts concise.</span>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
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
      {generationIndicator}
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Start a script to generate new scenes.</p>
  );
  const previewSection = context ? (
    <ScriptDisplay
      scenes={context.scenes}
      currentBlockId={currentBlockId}
      currentBlockIndex={currentBlockIndex}
      blockStatuses={blockStatuses}
      showHighlights={showHighlights}
      autoScroll={autoScroll}
      onToggleLock={onToggleLock}
      onSelectInsertTarget={onSelectInsertTarget}
      onChangeSpeaker={onChangeSpeaker}
      characters={context.characters}
      insertTarget={insertTarget}
      rewriteTarget={rewriteTarget}
      rewriteModeActive={activeTool === 'rewrite'}
      onSelectRewriteTarget={setRewriteTarget}
      insertModeActive={isInsertModeView}
      pendingInsertBlock={pendingInsertBlock}
      onConfirmInsertMode={onConfirmInsertMode}
      onCancelInsertMode={onCancelInsertMode}
      className={previewClassName}
      scrollable
      insertScrollTargetId={insertScrollTargetId}
      insertScrollToken={insertScrollToken}
    />
  ) : null;

  useEffect(() => {
    if (!insertModeActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelInsertMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insertModeActive, onCancelInsertMode]);

  const contentWrapperClassName = 'max-w-7xl mx-auto px-6 py-2 h-full min-h-0 flex flex-col gap-2';
  const insertModeToolbar = isInsertModeView ? (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.4em] text-indigo-200">Insert Mode</p>
        <p className="text-xs text-indigo-100/80">Select a spot below, then confirm inline.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelInsertMode}>
          Cancel
        </Button>
      </div>
    </div>
  ) : null;
  const setupModal = isSetupOpen ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onCloseSetup} />
      <div
        className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl bg-gradient-to-b from-slate-950 via-[#050a18] to-[#04070f] shadow-[0_35px_120px_rgba(2,6,23,0.75)] ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Setup"
      >
        <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.24),_transparent_42%)]" />
        <div className="relative flex items-center justify-between px-6 py-4 sm:px-7 sm:py-5">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.42em] text-indigo-200/70">Setup</p>
            <h2 className="text-xl font-semibold text-white">Start a new script</h2>
            <p className="text-xs text-slate-300/80">Pick a genre and let AI shape your opening spark.</p>
          </div>
          <button
            type="button"
            onClick={onCloseSetup}
            className="p-2.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close setup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6 overflow-y-auto max-h-[calc(92vh-112px)]">
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            onStart={onStartSetup}
            isLoading={isGenerating}
            onError={onSetupError}
            isLocked={false}
            showSubmit
            autoSurprise={setupAutoSurprise}
          />
        </div>
      </div>
    </div>
  ) : null;
  const handleToolClose = () => {
    setActiveTool(null);
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  };
  const handleToolSelect = (tool: ToolKey) => {
    if (activeTool === tool) {
      handleToolClose();
      return;
    }
    setActiveTool(tool);
  };
  const handleOpenTitleModal = () => {
    setTitleDraft(context?.title ?? '');
    setIsTitleModalOpen(true);
  };
  const handleCloseTitleModal = () => {
    setIsTitleModalOpen(false);
  };
  const handleSaveTitle = () => {
    const nextTitle = titleDraft.trim() || 'Untitled Screenplay';
    onTitleChange(nextTitle);
    setIsTitleModalOpen(false);
  };
  const rewriteOptions = useMemo(() => {
    if (!context) return [];
    return context.scenes.flatMap((scene, sceneIndex) => (
      scene.blocks.map((block, blockIndex) => {
        const typeLabel = block.type.charAt(0).toUpperCase() + block.type.slice(1);
        const fullSnippet = block.text.replace(/\s+/g, ' ').trim();
        const snippet = fullSnippet.slice(0, 36);
        const suffix = fullSnippet.length > 36 ? '…' : '';
        const label = `Scene ${sceneIndex + 1}: ${scene.heading} — ${typeLabel} ${blockIndex + 1}${snippet ? ` · ${snippet}${suffix}` : ''}`;
        return {
          sceneId: scene.id,
          blockId: block.id,
          label,
          locked: Boolean(block.locked),
          snippet
        };
      })
    ));
  }, [context]);
  useEffect(() => {
    if (rewriteOptions.length === 0) {
      setRewriteTarget(null);
      return;
    }
    if (!rewriteTarget || !rewriteOptions.some(option => option.blockId === rewriteTarget.blockId)) {
      const [first] = rewriteOptions;
      if (first) {
        setRewriteTarget({ sceneId: first.sceneId, blockId: first.blockId });
      }
    }
  }, [rewriteOptions, rewriteTarget]);
  const selectedRewrite = rewriteOptions.find(option => option.blockId === rewriteTarget?.blockId);
  const rewriteContent = context ? (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500">
        Click a block in the script to target rewrite.
      </p>
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">Selected Block</p>
        <p className="text-xs text-gray-200">
          {selectedRewrite ? selectedRewrite.label : 'No block selected.'}
        </p>
        {selectedRewrite?.locked && (
          <p className="text-[10px] text-amber-300">This block is locked and cannot be regenerated.</p>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
          Guidance (optional)
        </label>
        <textarea
          value={rewriteGuidance}
          onChange={(event) => setRewriteGuidance(event.target.value)}
          maxLength={220}
          placeholder="Tone, intent, constraints..."
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm h-20 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-600 shadow-inner"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-gray-500">{rewriteGuidance.length}/220 chars</p>
        <Button
          onClick={() => {
            if (rewriteTarget) {
              const guidance = rewriteGuidance.trim();
              onRegenerate(rewriteTarget.sceneId, rewriteTarget.blockId, guidance || undefined);
            }
          }}
          disabled={!rewriteTarget || Boolean(selectedRewrite?.locked) || isRegenerating}
          size="sm"
          className="shadow-lg shadow-indigo-500/20"
          title="Regenerate the selected block"
        >
          Regenerate
        </Button>
      </div>
    </div>
  ) : (
    <p className="text-[10px] text-gray-500">Generate a script to unlock rewrite tools.</p>
  );
  const insertContent = context ? (
    <InsertBlock
      characters={context.characters}
      genre={context.genre}
      onAddBlock={onAddBlock}
      onStartInsertMode={onStartInsertMode}
      insertModeActive={isInsertModeView}
      insertCompleteToken={insertCompleteToken}
      onError={onInsertError}
      disabled={isPlaying || isGenerating}
      insertTarget={insertTarget}
      styleContext={styleContext}
    />
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to unlock insert mode.</p>
  );

  return (
    <section className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-[#1a1a1a]">
      {context && (
        <div
          className={`shrink-0 border-b border-gray-800 bg-gray-900/40 ${isInsertModeView ? 'pointer-events-none opacity-60' : ''}`}
        >
          <div className="max-w-7xl mx-auto px-6 py-2.5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-semibold tracking-[0.22em] text-white">SCRIPT SEANCE</h1>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                  <span>{genreLabel}</span>
                  <span className="text-gray-600">•</span>
                  <span>{sceneCountLabel}</span>
                  <span className="text-gray-600">•</span>
                  <span>Draft autosaves locally.</span>
                  {autosaveError && (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className="text-amber-400">{autosaveError}</span>
                    </>
                  )}
                </div>
                {styleLabel && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-[10px] uppercase font-semibold tracking-[0.24em] text-gray-500">Style</span>
                    <span className="text-sm font-medium text-gray-200">{styleLabel}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center justify-center gap-1 text-center">
                <span className="text-[10px] uppercase font-semibold tracking-[0.24em] text-gray-500">Draft Title</span>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  <span className="text-base font-semibold text-white">
                    {context?.title?.trim() ? context.title : 'Untitled Screenplay'}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenTitleModal}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-indigo-400 hover:text-indigo-300"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-start lg:justify-end">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canUndo ? 'Undo last script change' : 'No action to undo'}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => onRedo?.()}
                    disabled={!canRedo || !onRedo}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canRedo ? 'Redo last undone script change' : 'No action to redo'}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                    Redo
                  </button>
                  <button
                    type="button"
                    onClick={onClearDraft}
                    disabled={!context}
                    className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Clear Draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {context ? (
          <div className={contentWrapperClassName}>
            {errorBanner}

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              {insertModeToolbar}
              <div className="flex-1 min-h-0">
                {previewSection}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center px-6 py-10">
              <div className="w-full max-w-2xl space-y-6">
                {errorBanner}
                {showInitialGeneration ? startGenerationCard : showStartScreen ? startScreenCard : null}
              </div>
            </div>
          </>
        )}
      </div>
      {context && (
        <BottomToolbelt
          activeTool={activeTool}
          onSelectTool={handleToolSelect}
          onCloseTool={handleToolClose}
          onExportTxt={onExportTxt}
          onExportPdf={onExportPdf}
          exportDisabled={!canExport}
          generateContent={generateContent}
          rewriteContent={rewriteContent}
          playbackContent={playbackContent}
          voicesContent={voicesContent}
          insertContent={insertContent}
        />
      )}
      <TitleEditModal
        isOpen={isTitleModalOpen}
        value={titleDraft}
        onChange={setTitleDraft}
        onSave={handleSaveTitle}
        onClose={handleCloseTitleModal}
        inputRef={titleInputRef}
      />
      {setupModal}
    </section>
  );
};
