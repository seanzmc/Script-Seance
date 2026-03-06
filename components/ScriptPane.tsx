import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockType, ScriptAnchor, ScriptBlock, ScriptSelectionTarget, StoryContext } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertComposerPopover } from './InsertComposerPopover';
import { RewriteComposerPopover } from './RewriteComposerPopover';
import { Button } from './Button';
import {
  SetupForm,
  SetupFormState,
  SETUP_UI_TOKENS,
  STYLE_PRESETS
} from './SetupForm';
import { PlaybackPanel, PlaybackPanelProps } from './PlaybackPanel';
import { TitleEditModal } from './TitleEditModal';
import { StyleEditModal } from './StyleEditModal';
import { useScriptController } from '../hooks/useScriptController';
import {
  createAfterBlockAnchor,
  createBeforeBlockAnchor,
  createSceneTopAnchor
} from '../services/scriptController';
import {
  AlertCircle,
  ChevronDown,
  Download,
  FileDown,
  Loader2,
  Pencil,
  PlusCircle,
  Sparkles,
  Undo2,
  Redo2,
  Volume2,
  X
} from 'lucide-react';

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
  onUndo: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  insertCompleteToken: number;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  onInsertError: (error: unknown) => void;
  onGenerateRewritePreview?: (params: {
    sceneId: string;
    blockId: string;
    instructions: string;
  }) => Promise<string>;
  onApplyRewritePreview?: (params: {
    sceneId: string;
    blockId: string;
    text: string;
  }) => void;
  onDeleteBlock?: (sceneId: string, blockId: string) => void;
  onRequestInsert?: (anchor: ScriptAnchor) => void;
  onInsertAtAnchor?: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  onGenerateInsertAtAnchor?: (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => Promise<void>;
  onUpdateSceneHeading?: (sceneId: string, heading: string) => void;
  onToggleLock: (sceneId: string, blockId: string) => void;
  isGenerating: boolean;
  isPlaying: boolean;
  onCancelGenerate: () => void;
  currentBlockId: string | null;
  currentBlockIndex: number;
  blockStatuses: Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>;
  showHighlights: boolean;
  autoScroll: boolean;
  onOpenPrivacy: () => void;
  onOpenSetup: () => void;
  onSaveStyle?: (style: string) => void;
  isSetupOpen: boolean;
  onCloseSetup: () => void;
  setupState: SetupFormState;
  onSetupChange: (next: Partial<SetupFormState>, meta?: { source?: 'user' | 'system' }) => void;
  onSetupSurprise?: (params: { mode: 'manual' | 'auto'; targetGenre: string }) => Promise<boolean>;
  onStartSetup: () => void;
  setupAutoSurprise: boolean;
  onSetupError?: (error: unknown, fallbackMessage: string) => boolean;
  onExportTxt: () => void;
  onExportPdf?: () => void;
  canExport: boolean;
  playbackProps?: PlaybackPanelProps;
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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onChangeSpeaker,
  onGenerateRewritePreview,
  onApplyRewritePreview,
  onDeleteBlock,
  onRequestInsert,
  onInsertAtAnchor,
  onGenerateInsertAtAnchor,
  onUpdateSceneHeading,
  onToggleLock,
  isGenerating,
  isPlaying,
  onCancelGenerate,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  showHighlights,
  autoScroll,
  onOpenPrivacy,
  onOpenSetup,
  onSaveStyle,
  isSetupOpen,
  onCloseSetup,
  setupState,
  onSetupChange,
  onSetupSurprise,
  onStartSetup,
  setupAutoSurprise,
  onSetupError,
  onExportTxt,
  onExportPdf,
  canExport,
  playbackProps,
  voicesContent,
  insertScrollTargetId,
  insertScrollToken
}) => {
  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false);
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState('');
  const [insertPlacementTarget, setInsertPlacementTarget] = useState<ScriptSelectionTarget | null>(null);
  const [editingHeadingSceneId, setEditingHeadingSceneId] = useState<string | null>(null);
  const [headingDraft, setHeadingDraft] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const generateMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const scriptController = useScriptController({
    context,
    insertModeActive: false,
    rewriteAutoSelectEnabled: true,
    onGenerateNext,
    onDeleteBlock,
    onRequestInsert,
    onInsertAtAnchor,
    onGenerateInsertAtAnchor,
    onGenerateRewritePreview,
    onApplyRewritePreview
  });
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const previewClassName = 'w-full';
  const genreLabel = context?.genre ?? 'Genre';
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
  const styleLabel = context?.style?.trim() || '';
  const toolLabelClass = 'text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300';
  const toolSectionClass = 'space-y-2';
  const toolInputClass = 'w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-500 shadow-inner';
  const generationIndicator = isGenerating ? (
    <div className="text-center text-gray-400 animate-pulse flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      <span className="text-base font-medium">Running writers room simulation...</span>
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
          <p className="text-xs uppercase tracking-[0.34em] text-gray-500">Start Screen</p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">SCRIPT SEANCE</h1>
          <p className="text-base md:text-lg text-gray-300">
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
        <p className="text-xl font-semibold text-white">Generating your opening scene...</p>
        <p className="text-base text-indigo-100/80">Gathering the writers room and shaping the first beat.</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
        Cancel
      </Button>
    </div>
  );
  const handleSelectRewriteTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    scriptController.selectBlockTarget(target);
  }, [scriptController]);
  const handleSelectBlockTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    scriptController.selectBlockTarget(target);
  }, [scriptController]);
  const handleSelectSceneHeading = useCallback((sceneId: string) => {
    scriptController.selectSceneHeading(sceneId);
  }, [scriptController]);
  const handleLegacyInsertTargetSelection = useCallback(() => {
    // Legacy insert mode is deprecated; inline anchor composer is the primary path.
  }, []);
  const handleClearSelectedBlock = useCallback(() => {
    setEditingHeadingSceneId(null);
    scriptController.clearBlockTarget();
  }, [scriptController]);
  const handleRequestInsertFromSlot = useCallback((anchor: ScriptAnchor) => {
    setInsertPlacementTarget(null);
    scriptController.requestInsert(anchor);
  }, [scriptController]);
  const handleOpenInsertFromSelection = useCallback((target: ScriptSelectionTarget) => {
    setInsertPlacementTarget(target);
    if (target.kind === 'scene-heading') {
      scriptController.requestInsert(createSceneTopAnchor(target.sceneId));
      return;
    }
    scriptController.requestInsert(createAfterBlockAnchor(target.blockId));
  }, [scriptController]);
  const handleCloseInsertComposer = useCallback(() => {
    setInsertPlacementTarget(null);
    scriptController.closeInsertComposer();
  }, [scriptController]);
  const handleInsertPlacementChange = useCallback((next: 'before' | 'after') => {
    if (!insertPlacementTarget || insertPlacementTarget.kind !== 'block') return;
    scriptController.requestInsert(
      next === 'before'
        ? createBeforeBlockAnchor(insertPlacementTarget.blockId)
        : createAfterBlockAnchor(insertPlacementTarget.blockId)
    );
  }, [insertPlacementTarget, scriptController]);
  const handleStartHeadingEdit = useCallback((sceneId: string, heading: string) => {
    scriptController.selectSceneHeading(sceneId);
    setHeadingDraft(heading);
    setEditingHeadingSceneId(sceneId);
    setInsertPlacementTarget(null);
  }, [scriptController]);
  const handleCancelHeadingEdit = useCallback(() => {
    setEditingHeadingSceneId(null);
  }, []);
  const handleSaveHeadingEdit = useCallback(() => {
    if (!editingHeadingSceneId) return;
    const nextHeading = headingDraft.trim();
    if (!nextHeading) return;
    onUpdateSceneHeading?.(editingHeadingSceneId, nextHeading);
    setEditingHeadingSceneId(null);
  }, [editingHeadingSceneId, headingDraft, onUpdateSceneHeading]);
  const composerCharacters = context?.characters ?? [];
  const totalScriptBlocks = useMemo(
    () => context?.scenes.reduce((count, scene) => count + scene.blocks.length, 0) ?? 0,
    [context]
  );
  const dialogueCharacterUnavailable = scriptController.composerBlockType === BlockType.DIALOGUE && composerCharacters.length === 0;
  const isBottomInsertSlotActive =
    scriptController.activeInsertIndex !== null && scriptController.activeInsertIndex === totalScriptBlocks;
  const insertComposerNode = scriptController.activeInsertAnchor ? (
    <InsertComposerPopover
      blockType={scriptController.composerBlockType}
      onBlockTypeChange={scriptController.setComposerBlockType}
      characters={composerCharacters}
      selectedCharacter={scriptController.composerCharacter}
      onCharacterChange={scriptController.setComposerCharacter}
      content={scriptController.composerContent}
      onContentChange={scriptController.setComposerContent}
      onGenerate={() => {
        void scriptController.generateInsertAtActiveAnchor();
      }}
      onInsert={scriptController.insertAtActiveAnchor}
      onCancel={handleCloseInsertComposer}
      onGenerateNextScene={() => {
        handleCloseInsertComposer();
        void scriptController.generateNextScene();
      }}
      isGenerating={scriptController.isComposerGenerating}
      isGeneratingNextScene={isGenerating}
      showGenerateNextSceneAction={isBottomInsertSlotActive}
      generateNextSceneDisabled={isPlaying || isGenerating}
      actionsDisabled={dialogueCharacterUnavailable}
      errorMessage={scriptController.composerError}
      showPlacementControls={insertPlacementTarget?.kind === 'block'}
      placement={scriptController.activeInsertAnchor?.kind === 'block' && scriptController.activeInsertAnchor.position === 'before' ? 'before' : 'after'}
      onPlacementChange={insertPlacementTarget?.kind === 'block' ? handleInsertPlacementChange : undefined}
    />
  ) : null;
  const rewriteComposerBlock = useMemo(() => {
    if (!context || !scriptController.rewriteComposerTarget) return null;
    const scene = context.scenes.find((entry) => entry.id === scriptController.rewriteComposerTarget?.sceneId);
    const block = scene?.blocks.find((entry) => entry.id === scriptController.rewriteComposerTarget?.blockId);
    return block ?? null;
  }, [context, scriptController.rewriteComposerTarget]);
  const rewriteComposerNode = scriptController.rewriteComposerTarget && rewriteComposerBlock ? (
    <RewriteComposerPopover
      blockType={rewriteComposerBlock.type}
      snippet={rewriteComposerBlock.text.replace(/\s+/g, ' ').trim() || '(No text)'}
      instructions={scriptController.rewriteInstructions}
      onInstructionsChange={scriptController.setRewriteInstructions}
      candidateText={scriptController.rewriteCandidateText}
      onGenerate={() => {
        void scriptController.generateRewritePreview();
      }}
      onApply={scriptController.applyRewritePreview}
      onCancel={scriptController.closeRewriteComposer}
      isGenerating={scriptController.isRewriteComposerGenerating}
      errorMessage={scriptController.rewriteComposerError}
    />
  ) : null;
  const editingHeading = editingHeadingSceneId && context
    ? context.scenes.find((scene) => scene.id === editingHeadingSceneId) ?? null
    : null;
  const headingEditorNode = editingHeading ? (
    <div
      role="dialog"
      aria-label="Edit Scene Heading"
      className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[#d6cdbd] bg-[#f6f1e7] p-4 shadow-[0_20px_54px_rgba(15,23,42,0.24)]"
    >
      <div className="space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">Scene Heading</p>
          <h3 className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-gray-800">Edit Scene Heading</h3>
        </div>
        <input
          value={headingDraft}
          onChange={(event) => setHeadingDraft(event.target.value)}
          className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          placeholder="INT. LOCATION - DAY"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancelHeadingEdit}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveHeadingEdit}>
            Save Heading
          </Button>
        </div>
      </div>
    </div>
  ) : null;
  const previewSection = context ? (
    <ScriptDisplay
      scenes={context.scenes}
      currentBlockId={currentBlockId}
      currentBlockIndex={currentBlockIndex}
      blockStatuses={blockStatuses}
      showHighlights={showHighlights}
      autoScroll={autoScroll}
      onToggleLock={onToggleLock}
      onSelectInsertTarget={handleLegacyInsertTargetSelection}
      onChangeSpeaker={onChangeSpeaker}
      characters={context.characters}
      rewriteTarget={scriptController.rewriteTarget}
      onSelectRewriteTarget={handleSelectRewriteTarget}
      selectedTarget={scriptController.selectedTarget}
      selectedBlockTarget={scriptController.selectedBlockTarget}
      onSelectBlockTarget={handleSelectBlockTarget}
      onSelectSceneHeading={handleSelectSceneHeading}
      onClearBlockTarget={handleClearSelectedBlock}
      onRewriteBlock={scriptController.openRewrite}
      onOpenInsertFromSelection={handleOpenInsertFromSelection}
      onEditSceneHeading={handleStartHeadingEdit}
      onDeleteBlock={onDeleteBlock ? scriptController.deleteBlock : undefined}
      activeInsertIndex={scriptController.activeInsertIndex}
      activeInsertAnchor={scriptController.activeInsertAnchor}
      onRequestInsert={handleRequestInsertFromSlot}
      insertComposer={insertComposerNode}
      onCloseInsertComposer={handleCloseInsertComposer}
      activeRewriteBlockId={scriptController.activeRewriteBlockId ?? null}
      rewriteComposer={rewriteComposerNode}
      onCloseRewriteComposer={scriptController.closeRewriteComposer}
      activeHeadingSceneId={editingHeadingSceneId}
      headingEditor={headingEditorNode}
      className={previewClassName}
      scrollable
      insertScrollTargetId={insertScrollTargetId}
      insertScrollToken={insertScrollToken}
    />
  ) : null;

  useEffect(() => {
    if (scriptController.activeInsertAnchor) return;
    setInsertPlacementTarget(null);
  }, [scriptController.activeInsertAnchor]);

  useEffect(() => {
    if (!editingHeadingSceneId || !context?.scenes.some((scene) => scene.id === editingHeadingSceneId)) {
      setEditingHeadingSceneId(null);
    }
  }, [context, editingHeadingSceneId]);

  const focusScriptScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  }, []);
  const handleOpenTitleModal = () => {
    setTitleDraft(context?.title ?? '');
    setIsTitleModalOpen(true);
  };
  const handleCloseTitleModal = () => {
    setIsTitleModalOpen(false);
  };
  const handleOpenStyleModal = () => {
    setStyleDraft(context?.style ?? '');
    setIsStyleModalOpen(true);
  };
  const handleCloseStyleModal = () => {
    setIsStyleModalOpen(false);
  };
  const handleSaveStyle = () => {
    onSaveStyle?.(styleDraft);
    setIsStyleModalOpen(false);
  };
  const handleSaveTitle = () => {
    const nextTitle = titleDraft.trim() || 'Untitled Screenplay';
    onTitleChange(nextTitle);
    setIsTitleModalOpen(false);
  };
  const sceneEndAnchor = useMemo(() => {
    if (!context || context.scenes.length === 0) return null;
    const lastScene = context.scenes[context.scenes.length - 1];
    const lastBlock = lastScene.blocks[lastScene.blocks.length - 1];
    return lastBlock
      ? createAfterBlockAnchor(lastBlock.id)
      : createSceneTopAnchor(lastScene.id);
  }, [context]);
  const playbackContent = context && playbackProps ? (
    <PlaybackPanel {...playbackProps} />
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to begin playback.</p>
  );
  const contentWrapperClassName = 'max-w-[1240px] mx-auto w-full px-6 max-[900px]:px-4 max-[640px]:px-3 py-5 h-full min-h-0 flex flex-col gap-4';
  const handleGenerateNext = useCallback(() => {
    setIsGenerateMenuOpen(false);
    void scriptController.generateNextScene();
  }, [scriptController]);
  const handleGeneratePlotTwist = useCallback(() => {
    setIsGenerateMenuOpen(false);
    onPlotTwist();
  }, [onPlotTwist]);
  const handleInsertSceneBeat = useCallback(() => {
    if (!sceneEndAnchor) return;
    setIsGenerateMenuOpen(false);
    setInsertPlacementTarget(null);
    scriptController.requestInsert(sceneEndAnchor);
    focusScriptScroll();
  }, [focusScriptScroll, sceneEndAnchor, scriptController]);
  const generatePanelContent = (
    <div className="space-y-3">
      <div className={toolSectionClass}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={toolLabelClass}>Prompt</h3>
          <span className={`text-[10px] ${promptWarning ? 'text-amber-400' : 'text-gray-500'}`}>
            {promptCount}/{PROMPT_CHAR_LIMIT}
          </span>
        </div>
        <textarea
          value={userInstruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="Suggest an action, beat, or tonal adjustment..."
          className={`${toolInputClass} h-24 resize-none`}
        />
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
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
          {promptWarning && <span>Trim prompts.</span>}
        </div>
      </div>
      <div className="grid gap-2">
        <Button
          onClick={handleGenerateNext}
          loading={isGenerating}
          disabled={isPlaying}
          className="justify-start shadow-lg shadow-indigo-500/20"
          title="Generate the next section of the screenplay"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Generate / Continue Writing
        </Button>
        <Button
          onClick={handleGeneratePlotTwist}
          variant="secondary"
          size="sm"
          disabled={isGenerating}
          className="justify-start"
          title="Generate a plot twist"
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Plot Twist
        </Button>
        <Button
          onClick={handleInsertSceneBeat}
          variant="secondary"
          size="sm"
          disabled={!sceneEndAnchor || isGenerating || isPlaying}
          className="justify-start"
          title="Insert a new scene or beat at the current draft edge"
        >
          <PlusCircle className="mr-2 h-3.5 w-3.5" />
          Insert Scene / New Beat
        </Button>
      </div>
      {generationIndicator}
    </div>
  );
  const setupModal = isSetupOpen ? (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-gradient-to-b from-slate-950 via-[#050a18] to-[#04070f]"
      role="region"
      aria-label="Setup"
      data-testid="setup-screen"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.24),_transparent_42%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl bg-slate-950/60 shadow-[0_35px_120px_rgba(2,6,23,0.75)] backdrop-blur-md sm:min-h-[calc(100vh-3rem)]">
          <div className="relative flex items-center justify-between px-6 py-4 sm:px-7 sm:py-5">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.42em] text-indigo-200/70">Setup</p>
              <h2 className={SETUP_UI_TOKENS.title}>Start a new script</h2>
              <p className={SETUP_UI_TOKENS.subtitle}>Pick a genre and let AI shape your opening spark.</p>
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
          <div className="relative flex-1 overflow-y-auto px-4 pb-5 sm:px-6 sm:pb-6">
            <SetupForm
              value={setupState}
              onChange={onSetupChange}
              onRequestSurprise={onSetupSurprise}
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
    </div>
  ) : null;

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (exportMenuRef.current?.contains(targetNode)) return;
      setIsExportMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  useEffect(() => {
    if (!isGenerateMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (generateMenuRef.current?.contains(targetNode)) return;
      setIsGenerateMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGenerateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerateMenuOpen]);

  useEffect(() => {
    if (!isAudioDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAudioDrawerOpen(false);
        focusScriptScroll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusScriptScroll, isAudioDrawerOpen]);

  return (
    <section className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-[#17181c]">
      {context && (
        <div className="relative z-[95] shrink-0 border-b border-gray-800/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.68),rgba(15,23,42,0.38))] backdrop-blur">
          <div className="relative max-w-[1240px] mx-auto px-6 max-[900px]:px-4 max-[640px]:px-3 py-4 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-indigo-200/80">Script Seance</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-[0.08em] text-white sm:text-2xl">
                    {context.title?.trim() ? context.title : 'Untitled Screenplay'}
                  </h1>
                  <button
                    type="button"
                    onClick={handleOpenTitleModal}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200 transition-colors hover:bg-indigo-500/20"
                    title="Edit title"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-300">
                  <span>{genreLabel}</span>
                  <span className="text-gray-600">•</span>
                  <span>{sceneCountLabel}</span>
                  <span className="text-gray-600">•</span>
                  <span>Style: {styleLabel || 'No style set'}</span>
                  {onSaveStyle && (
                    <button
                      type="button"
                      onClick={handleOpenStyleModal}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-200"
                      title="Edit style"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Style
                    </button>
                  )}
                  <span className="text-gray-600">•</span>
                  <span>Draft autosaves locally.</span>
                  {autosaveError && (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className="text-amber-400">{autosaveError}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-900/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canUndo ? 'Undo last script change' : 'No action to undo'}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => onRedo?.()}
                  disabled={!canRedo || !onRedo}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-900/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canRedo ? 'Redo last undone script change' : 'No action to redo'}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                  Redo
                </button>
                <div className="relative" ref={generateMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsGenerateMenuOpen((previous) => !previous)}
                    disabled={isPlaying}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-haspopup="dialog"
                    aria-expanded={isGenerateMenuOpen}
                    aria-label="Open generate menu"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isGenerateMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isGenerateMenuOpen && (
                    <div
                      role="dialog"
                      aria-label="Generate menu"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-[85] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-700 bg-gray-950/96 p-4 shadow-[0_24px_48px_rgba(0,0,0,0.42)] backdrop-blur"
                    >
                      {generatePanelContent}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsAudioDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:bg-gray-800"
                  aria-haspopup="dialog"
                  aria-expanded={isAudioDrawerOpen}
                  aria-label="Open audio drawer"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  Audio
                </button>
                <div className="relative" ref={exportMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsExportMenuOpen((previous) => !previous)}
                    disabled={!canExport}
                    className="inline-flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-900/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Open export menu"
                    aria-haspopup="menu"
                    aria-expanded={isExportMenuOpen}
                    aria-label="Open export menu"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                  {isExportMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Export options"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-[85] min-w-[12rem] rounded-xl border border-gray-700 bg-gray-950/96 p-2 shadow-[0_18px_38px_rgba(0,0,0,0.42)] backdrop-blur"
                    >
                      <div className="space-y-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onExportTxt();
                            setIsExportMenuOpen(false);
                          }}
                          disabled={!canExport}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Export script as a .txt file"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export Script (.txt)
                        </button>
                        {onExportPdf && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onExportPdf();
                              setIsExportMenuOpen(false);
                            }}
                            disabled={!canExport}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Export script as a PDF via print dialog"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            Export PDF
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClearDraft}
                  disabled={!context}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Clear Draft
                </button>
                {isGenerating && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-100">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Writing
                    <button
                      type="button"
                      onClick={onCancelGenerate}
                      className="rounded-full border border-indigo-300/30 px-2 py-0.5 text-[9px] tracking-[0.16em] text-indigo-100 transition-colors hover:bg-indigo-400/10"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {context ? (
          <div className={contentWrapperClassName}>
            {errorBanner}

            <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0">
              <div className="flex-1 min-h-0 min-w-0">
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
      {context && isAudioDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[79] bg-black/55 backdrop-blur-[2px]"
            onClick={() => {
              setIsAudioDrawerOpen(false);
              focusScriptScroll();
            }}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-label="Audio drawer"
            data-testid="audio-drawer"
            className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[28rem] flex-col border-l border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] shadow-[-24px_0_48px_rgba(0,0,0,0.42)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-4 sm:px-5">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Audio</p>
                <h2 className="text-lg font-semibold text-white">Playback and Voice Utility</h2>
                <p className="text-[11px] text-gray-400">Assign voices, control playback, and tune follow-along behavior.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAudioDrawerOpen(false);
                  focusScriptScroll();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label="Close audio drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="space-y-4">
                <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                  {playbackContent}
                </section>
                <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                  {voicesContent ?? <p className="text-[11px] text-gray-500">Voice controls unavailable.</p>}
                </section>
              </div>
            </div>
          </aside>
        </>
      )}
      <TitleEditModal
        isOpen={isTitleModalOpen}
        value={titleDraft}
        onChange={setTitleDraft}
        onSave={handleSaveTitle}
        onClose={handleCloseTitleModal}
        inputRef={titleInputRef}
      />
      <StyleEditModal
        isOpen={isStyleModalOpen}
        value={styleDraft}
        presets={STYLE_PRESETS}
        onChange={setStyleDraft}
        onSave={handleSaveStyle}
        onClose={handleCloseStyleModal}
      />
      {setupModal}
    </section>
  );
};
