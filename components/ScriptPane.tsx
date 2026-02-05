import React, { useEffect, useState } from 'react';
import { StoryContext, ScriptBlock } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertBlock } from './InsertBlock';
import { Button } from './Button';
import { SetupForm, SetupFormState } from './SetupForm';
import { BottomToolbelt, ToolKey } from './BottomToolbelt';
import { TitleEditModal } from './TitleEditModal';
import { AlertCircle, Loader2, Sparkles, PlusCircle, X, Pencil } from 'lucide-react';

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
  onOpenSetup: () => void;
  onSurpriseSetup: () => void;
  isSetupOpen: boolean;
  onCloseSetup: () => void;
  setupState: SetupFormState;
  onSetupChange: (next: Partial<SetupFormState>) => void;
  onStartSetup: () => void;
  setupAutoSurprise: boolean;
  setupSurprisePrompt?: boolean;
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
  suggestedTitle,
  isSuggestingTitle,
  suggestedTitleDismissed,
  onUseSuggestedTitle,
  onDismissSuggestedTitle,
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
  onSurpriseSetup,
  isSetupOpen,
  onCloseSetup,
  setupState,
  onSetupChange,
  onStartSetup,
  setupAutoSurprise,
  setupSurprisePrompt,
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
  const [viewMode, setViewMode] = useState<ViewMode>(getDefaultViewMode);
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const isSplitView = viewMode === 'split';
  const isInsertModeView = insertModeActive && Boolean(context);
  const insertModeAvailable = viewMode !== 'preview';
  const titleMatchesSuggestion = Boolean(context && suggestedTitle && context.title.trim() === suggestedTitle);
  const showSuggestedTitle = Boolean(context && suggestedTitle && !suggestedTitleDismissed);
  const showSuggestingTitle = Boolean(context && !suggestedTitle && isSuggestingTitle && !suggestedTitleDismissed);
  const previewWidthClass = viewMode === 'preview' ? 'max-w-none w-full' : 'w-full';
  const previewLayoutClass = isSplitView ? 'h-full min-h-0' : '';
  const previewClassName = `${previewWidthClass} ${previewLayoutClass} ${
    isInsertModeView ? 'ring-2 ring-indigo-400/60 shadow-[0_0_30px_rgba(79,70,229,0.25)]' : ''
  }`.trim();
  const genreLabel = context?.genre ?? 'Genre';
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
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
            onClick={onOpenSetup}
            size="lg"
            className="w-full sm:w-auto px-8 text-base shadow-[0_0_35px_rgba(79,70,229,0.45)] hover:shadow-[0_0_50px_rgba(79,70,229,0.6)]"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Start a New Script
          </Button>
          <Button
            onClick={onSurpriseSetup}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <Sparkles className="w-3.5 h-3.5 mr-2" />
            Surprise Me
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
    <div className="space-y-4">
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
      onRegenerate={onRegenerate}
      onToggleLock={onToggleLock}
      onSelectInsertTarget={onSelectInsertTarget}
      onChangeSpeaker={onChangeSpeaker}
      characters={context.characters}
      insertTarget={insertTarget}
      insertModeActive={isInsertModeView}
      pendingInsertBlock={pendingInsertBlock}
      onConfirmInsertMode={onConfirmInsertMode}
      onCancelInsertMode={onCancelInsertMode}
      isRegenerating={isRegenerating}
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

  useEffect(() => {
    if (viewMode === 'preview' && insertModeActive) {
      onCancelInsertMode();
    }
  }, [insertModeActive, onCancelInsertMode, viewMode]);

  const contentWrapperClassName = 'max-w-6xl mx-auto px-6 py-6 h-full min-h-0 flex flex-col gap-6';
  const writePanelClassName = `transition-all duration-300 ease-out overflow-hidden ${
    isInsertModeView ? 'max-h-0 opacity-0 -translate-y-2 pointer-events-none' : 'max-h-[2000px] opacity-100 translate-y-0'
  }`;
  const insertPanelClassName = `transition-all duration-300 ease-out overflow-hidden ${
    isInsertModeView ? 'max-h-[2000px] opacity-100 translate-y-0 flex-1 min-h-0' : 'max-h-0 opacity-0 translate-y-2 pointer-events-none'
  }`;
  const splitGridClassName = `grid grid-cols-1 ${
    isInsertModeView ? 'lg:grid-cols-[minmax(0,0)_minmax(0,100%)]' : 'lg:grid-cols-[minmax(0,40%)_minmax(0,60%)]'
  } gap-6 flex-1 min-h-0 transition-all duration-300 ease-out`;
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
    <div className="fixed inset-0 z-[70] flex">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCloseSetup} />
      <div
        className="relative ml-auto h-full w-full max-w-xl border-l border-gray-800 bg-gray-950 shadow-2xl animate-in slide-in-from-right-8 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Setup"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-5">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.4em] text-gray-500">Setup</p>
            <h2 className="text-xl font-semibold text-white">Start a new script</h2>
            <p className="text-xs text-gray-400">Define the premise, cast, and tone before we write.</p>
          </div>
          <button
            type="button"
            onClick={onCloseSetup}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close setup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="h-full overflow-y-auto p-6 pb-10">
          <SetupForm
            value={setupState}
            onChange={onSetupChange}
            onStart={onStartSetup}
            isLoading={isGenerating}
            onError={onSetupError}
            isLocked={false}
            showSubmit
            autoSurprise={setupAutoSurprise}
            surprisePrompt={setupSurprisePrompt}
          />
        </div>
      </div>
    </div>
  ) : null;
  const handleToolSelect = (tool: ToolKey) => {
    setActiveTool(tool);
  };
  const handleToolClose = () => {
    setActiveTool(null);
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
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
  const insertContent = context ? (
    <InsertBlock
      characters={context.characters}
      genre={context.genre}
      onAddBlock={onAddBlock}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      onStartInsertMode={onStartInsertMode}
      insertModeActive={isInsertModeView}
      insertModeAvailable={insertModeAvailable}
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
          <div className="max-w-6xl mx-auto px-6 py-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Script Seance</h1>
                <p className="text-[11px] uppercase tracking-[0.4em] text-gray-400">Script Workspace</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                  <span>{genreLabel}</span>
                  <span className="text-gray-600">•</span>
                  <span>{sceneCountLabel}</span>
                  <span className="text-gray-600">•</span>
                  <button
                    type="button"
                    onClick={onClearDraft}
                    disabled={!context}
                    className="uppercase tracking-widest text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Clear Draft
                  </button>
                </div>
              </div>
              <div className="flex lg:justify-end">
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
                        disabled={insertModeActive}
                        aria-disabled={insertModeActive}
                        className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed ${
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

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-[10px] uppercase font-semibold text-gray-500 block tracking-[0.28em] mb-1">
                  Draft Title
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg md:text-xl font-semibold text-white">
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
                {showSuggestedTitle && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span>
                      Suggested title:{' '}
                      <span className="text-gray-200 font-medium">{suggestedTitle}</span>
                    </span>
                    <button
                      type="button"
                      onClick={onUseSuggestedTitle}
                      disabled={titleMatchesSuggestion}
                      className="text-indigo-400 hover:text-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={onDismissSuggestedTitle}
                      className="text-gray-500 hover:text-gray-300"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {showSuggestingTitle && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    Generating a suggested title...
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                  <span>Draft autosaves locally.</span>
                  {autosaveError && <span className="text-amber-400">{autosaveError}</span>}
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

            {context && viewMode === 'write' && (
              <div className="flex flex-col gap-6 flex-1 min-h-0">
                <div className={writePanelClassName}>
                  <div className={`space-y-6 ${isInsertModeView ? 'pointer-events-none opacity-40' : ''}`}>
                    <p className="text-[11px] text-gray-500">
                      Use the tool belt below to generate or insert new content.
                    </p>
                  </div>
                </div>
                <div className={insertPanelClassName}>
                  <div className="flex flex-col gap-4 h-full">
                    {insertModeToolbar}
                    <div className="flex-1 min-h-0">
                      {previewSection}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {context && viewMode === 'preview' && (
              <div className="flex flex-col gap-6 flex-1 min-h-0">
                <div className="flex-1 min-h-0">
                  {previewSection}
                </div>
              </div>
            )}

            {context && viewMode === 'split' && (
              <div className={splitGridClassName}>
                <div
                  className={`min-h-0 h-full overflow-hidden pr-2 space-y-6 transition-all duration-300 ease-out ${
                    isInsertModeView ? 'opacity-0 -translate-x-2 pointer-events-none' : 'opacity-100 translate-x-0'
                  }`}
                >
                  <div className="text-[11px] text-gray-500">
                    Use the tool belt below to generate or insert new content.
                  </div>
                </div>
                <div className="min-h-0 h-full overflow-hidden flex flex-col gap-4">
                  {insertModeToolbar}
                  <div className="flex-1 min-h-0">
                    {previewSection}
                  </div>
                </div>
              </div>
            )}
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
      <BottomToolbelt
        activeTool={activeTool}
        onSelectTool={handleToolSelect}
        onCloseTool={handleToolClose}
        onExportTxt={onExportTxt}
        onExportPdf={onExportPdf}
        exportDisabled={!canExport}
        generateContent={generateContent}
        playbackContent={playbackContent}
        voicesContent={voicesContent}
        insertContent={insertContent}
      />
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
