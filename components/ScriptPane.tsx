import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockType, ScriptAnchor, StoryContext, ScriptBlock } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertComposerPopover } from './InsertComposerPopover';
import { RewriteComposerPopover } from './RewriteComposerPopover';
import { InsertBlock } from './InsertBlock';
import { Button } from './Button';
import {
  SetupForm,
  SetupFormState,
  SETUP_UI_TOKENS,
  STYLE_PRESETS
} from './SetupForm';
import { BottomToolbelt, ToolKey } from './BottomToolbelt';
import { PlaybackMiniPlayer, PlaybackPanel, PlaybackPanelProps } from './PlaybackPanel';
import { ToolPanelShell, getToolPanelBodyMaxHeight, getToolPanelMaxHeight } from './ToolPanelShell';
import { TitleEditModal } from './TitleEditModal';
import { StyleEditModal } from './StyleEditModal';
import { useScriptController } from '../hooks/useScriptController';
import { createAfterBlockAnchor, createSceneTopAnchor } from '../services/scriptController';
import { AlertCircle, Download, FileDown, Loader2, Sparkles, PlusCircle, X, Pencil, Undo2, Redo2 } from 'lucide-react';

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
const MOBILE_FOCUS_QUERY = '(max-width: 900px)';
const MOBILE_TOOLS_DOCK_OFFSET_CLASS = 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]';
const MOBILE_TOOLS_DOCK_BOTTOM = 'calc(4.75rem + env(safe-area-inset-bottom))';
const MOBILE_TOOLS_DOCK_PADDING = 'calc(4.75rem + env(safe-area-inset-bottom))';
const MOBILE_PLAYBACK_SHEET_COLLAPSED_PX = 88;
const MOBILE_PLAYBACK_SHEET_EXPANDED_PX = 200;
const MOBILE_PLAYBACK_SHEET_EXPANDED_MAX = `min(${MOBILE_PLAYBACK_SHEET_EXPANDED_PX}px, 34vh)`;
const DESKTOP_PLAYBACK_SHEET_COLLAPSED_PX = 88;
const DESKTOP_PLAYBACK_SHEET_EXPANDED_MAX = 'min(320px, 44vh)';
const MOBILE_GENERATE_SHEET_MAX_HEIGHT = getToolPanelMaxHeight('mobile-sheet', 'medium');
const MOBILE_TOOL_SHEET_MAX_HEIGHT = getToolPanelMaxHeight('mobile-sheet', 'default');
const MOBILE_MENU_SHEET_MAX_HEIGHT = '50vh';
const LEGACY_TOOL_ORDER: ToolKey[] = ['generate', 'insert', 'rewrite', 'voices'];
const TOOL_LABELS: Record<ToolKey, string> = {
  generate: 'Generate',
  insert: 'Insert',
  rewrite: 'Rewrite',
  voices: 'Voices',
  playback: 'Playback',
  export: 'Export'
};

interface MobileBottomSheetProps {
  title: string;
  maxHeight: string;
  bodyClassName?: string;
  onClose?: () => void;
  onBackdropClick?: () => void;
  closeLabel?: string;
  sheetTestId?: string;
  children: React.ReactNode;
}

const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  title,
  maxHeight,
  bodyClassName = 'p-3',
  onClose,
  onBackdropClick,
  closeLabel = 'Close',
  sheetTestId,
  children
}) => (
  <>
    <div
      className="fixed inset-x-0 top-0 z-[75] bg-black/45 backdrop-blur-[1px]"
      style={{ bottom: MOBILE_TOOLS_DOCK_BOTTOM }}
      onClick={onBackdropClick}
      aria-hidden="true"
    />
    <div className={`fixed inset-x-0 ${MOBILE_TOOLS_DOCK_OFFSET_CLASS} z-[76]`}>
      <ToolPanelShell
        title={title}
        onClose={onClose}
        closeLabel={closeLabel}
        variant="mobile-sheet"
        maxHeight={maxHeight}
        bodyMaxHeight={getToolPanelBodyMaxHeight(maxHeight)}
        bodyClassName={bodyClassName}
        shellTestId={sheetTestId}
      >
        {children}
      </ToolPanelShell>
    </div>
  </>
);

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
  insertCompleteToken,
  onChangeSpeaker,
  onInsertError,
  onGenerateRewritePreview,
  onApplyRewritePreview,
  onDeleteBlock,
  onRequestInsert,
  onInsertAtAnchor,
  onGenerateInsertAtAnchor,
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
  const [currentTool, setCurrentTool] = useState<ToolKey | null>(null);
  const [toolsSheet, setToolsSheet] = useState<'collapsed' | 'menu' | 'tool'>('collapsed');
  const [rewriteMode, setRewriteMode] = useState<'select' | 'configure'>('configure');
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_FOCUS_QUERY).matches
  ));
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [rewriteGuidance, setRewriteGuidance] = useState('');
  const [isPlaybackExpanded, setIsPlaybackExpanded] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const rewriteAutoSelectEnabled = !(isNarrowViewport && currentTool === 'rewrite' && rewriteMode === 'select');
  const scriptController = useScriptController({
    context,
    insertModeActive: false,
    rewriteAutoSelectEnabled,
    onGenerateNext,
    onDeleteBlock,
    onRequestInsert,
    onInsertAtAnchor,
    onGenerateInsertAtAnchor,
    onGenerateRewritePreview,
    onApplyRewritePreview
  });
  const lastInsertCompleteTokenRef = useRef(insertCompleteToken);
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const previewClassName = 'w-full';
  const genreLabel = context?.genre ?? 'Genre';
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
  const styleLabel = context?.style?.trim() || '';
  const toolLabelClass = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';
  const toolSectionClass = 'space-y-2';
  const toolInputClass = 'w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-600 shadow-inner';
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
    <div className="space-y-2">
      <div className={toolSectionClass}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={toolLabelClass}>Prompt</h3>
          <span className={`text-[10px] ${promptWarning ? 'text-amber-400' : 'text-gray-500'}`}>
            {promptCount}/{PROMPT_CHAR_LIMIT} chars
          </span>
        </div>
        <textarea
          value={userInstruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder="Suggest an action, or leave empty for AI to decide..."
          className={`${toolInputClass} h-16 sm:h-[68px]`}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          onClick={() => {
            void scriptController.generateNextScene();
          }}
          loading={isGenerating}
          disabled={isPlaying}
          className="shadow-lg shadow-indigo-500/20"
          title="Generate the next scene"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Generate Next
        </Button>
      </div>
      {generationIndicator}
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Start a script to generate new scenes.</p>
  );
  const handleSelectRewriteTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    scriptController.selectBlockTarget(target);
    if (isNarrowViewport && currentTool === 'rewrite') {
      setRewriteMode('configure');
      setToolsSheet('tool');
    }
  }, [currentTool, isNarrowViewport, scriptController]);
  const handleSelectBlockTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    scriptController.selectBlockTarget(target);
  }, [scriptController]);
  const handleLegacyInsertTargetSelection = useCallback(() => {
    // Legacy insert mode is deprecated; inline anchor composer is the primary path.
  }, []);
  const handleClearSelectedBlock = useCallback(() => {
    scriptController.clearBlockTarget();
  }, [scriptController]);
  const composerCharacters = context?.characters ?? [];
  const totalScriptBlocks = useMemo(
    () => context?.scenes.reduce((count, scene) => count + scene.blocks.length, 0) ?? 0,
    [context]
  );
  const dialogueCharacterUnavailable = scriptController.composerBlockType === BlockType.DIALOGUE && composerCharacters.length === 0;
  const isBottomInsertSlotActive =
    scriptController.activeInsertIndex !== null && scriptController.activeInsertIndex === totalScriptBlocks;
  const insertComposerNode = scriptController.activeInsertIndex !== null ? (
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
      onCancel={scriptController.closeInsertComposer}
      onGenerateNextScene={() => {
        scriptController.closeInsertComposer();
        void scriptController.generateNextScene();
      }}
      isGenerating={scriptController.isComposerGenerating}
      isGeneratingNextScene={isGenerating}
      showGenerateNextSceneAction={isBottomInsertSlotActive}
      generateNextSceneDisabled={isPlaying || isGenerating}
      actionsDisabled={dialogueCharacterUnavailable}
      errorMessage={scriptController.composerError}
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
      rewriteModeActive={currentTool === 'rewrite' && (!isNarrowViewport || rewriteMode === 'select')}
      onSelectRewriteTarget={handleSelectRewriteTarget}
      selectedBlockTarget={scriptController.selectedBlockTarget}
      onSelectBlockTarget={handleSelectBlockTarget}
      onClearBlockTarget={handleClearSelectedBlock}
      onRewriteBlock={scriptController.openRewrite}
      onDeleteBlock={onDeleteBlock ? scriptController.deleteBlock : undefined}
      activeInsertIndex={scriptController.activeInsertIndex}
      onRequestInsert={scriptController.requestInsert}
      insertComposer={insertComposerNode}
      onCloseInsertComposer={scriptController.closeInsertComposer}
      activeRewriteBlockId={scriptController.activeRewriteBlockId ?? null}
      rewriteComposer={rewriteComposerNode}
      onCloseRewriteComposer={scriptController.closeRewriteComposer}
      className={previewClassName}
      scrollable
      insertScrollTargetId={insertScrollTargetId}
      insertScrollToken={insertScrollToken}
    />
  ) : null;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(MOBILE_FOCUS_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };

    setIsNarrowViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange);
      return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }
    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

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
    if (!isNarrowViewport) {
      setToolsSheet('collapsed');
      setRewriteMode('configure');
      return;
    }
    if (!currentTool && toolsSheet === 'tool') {
      setToolsSheet('collapsed');
    }
  }, [currentTool, isNarrowViewport, toolsSheet]);

  useEffect(() => {
    if (!isNarrowViewport || currentTool !== 'insert') {
      lastInsertCompleteTokenRef.current = insertCompleteToken;
      return;
    }
    if (insertCompleteToken > lastInsertCompleteTokenRef.current) {
      setToolsSheet('tool');
    }
    lastInsertCompleteTokenRef.current = insertCompleteToken;
  }, [currentTool, insertCompleteToken, isNarrowViewport]);

  const contentWrapperClassName = 'max-w-7xl mx-auto w-full px-6 max-[900px]:px-4 max-[640px]:px-3 py-2 h-full min-h-0 flex flex-col gap-2';
  const mobileSheetEnabled = isNarrowViewport && Boolean(context);
  const isMenuSheetOpen = mobileSheetEnabled && toolsSheet === 'menu';
  const isLegacyToolSelected = Boolean(currentTool && LEGACY_TOOL_ORDER.includes(currentTool));
  const isMobileStandardToolSheetVisible = mobileSheetEnabled
    && toolsSheet === 'tool'
    && isLegacyToolSelected;
  const isMobileFloatingPlaybackVisible = mobileSheetEnabled && Boolean(playbackProps);
  const isMobileRewriteSelectMode = mobileSheetEnabled && currentTool === 'rewrite' && rewriteMode === 'select';
  const activeToolLabel = currentTool ? TOOL_LABELS[currentTool] : null;
  const mobileDockLabel = isMenuSheetOpen
    ? 'Choose a tool'
    : isMobileStandardToolSheetVisible
      ? activeToolLabel ? `${activeToolLabel} open` : 'Tool panel open'
      : activeToolLabel ? `View ${activeToolLabel}` : 'Open tools';
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
  const focusScriptScroll = () => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  };
  const handleToolClose = () => {
    setCurrentTool(null);
    setToolsSheet('collapsed');
    focusScriptScroll();
  };
  const handleMobileToolPanelClose = () => {
    handleToolClose();
  };
  const handleActiveToolDismiss = () => {
    handleToolClose();
  };
  const handleDesktopToolSelect = (tool: ToolKey) => {
    if (currentTool === tool) {
      handleToolClose();
      return;
    }
    setCurrentTool(tool);
    setRewriteMode('configure');
  };
  const handleSelectToolFromMenu = (tool: ToolKey) => {
    setCurrentTool(tool);
    if (tool === 'rewrite') {
      setRewriteMode('select');
      scriptController.setRewriteTarget(null);
      setToolsSheet('collapsed');
      return;
    }
    setRewriteMode('configure');
    setToolsSheet('tool');
  };
  const handleToggleMobileDock = () => {
    if (!mobileSheetEnabled) return;
    if (toolsSheet === 'collapsed') {
      setToolsSheet('menu');
      return;
    }
    if (toolsSheet === 'menu') {
      setToolsSheet('collapsed');
      return;
    }
    setToolsSheet('menu');
  };
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
  const selectedRewrite = scriptController.rewriteOptions.find(
    (option) => option.blockId === scriptController.rewriteTarget?.blockId
  );
  const rewriteContent = context ? (
    <div className="space-y-2">
      <div className={toolSectionClass}>
        <p className="text-[10px] text-gray-500">
          {isNarrowViewport
            ? 'Selected block appears below. Use Change selection to pick another block.'
            : 'Click a block in the script to target rewrite.'}
        </p>
        <div className="px-0.5 py-0.5 space-y-1">
          <p className={toolLabelClass}>Selected Block</p>
          <p className="text-[11px] text-gray-400 break-words">{selectedRewrite?.label}</p>
          {selectedRewrite && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/65 px-2.5 py-2">
              <p className="text-xs text-gray-200 whitespace-pre-wrap break-words">
                {selectedRewrite.displayText}
              </p>
            </div>
          )}
          {!selectedRewrite && (
            <p className="text-xs text-gray-400">No block selected.</p>
          )}
          {selectedRewrite?.locked && (
            <p className="text-[10px] text-amber-300">This block is locked and cannot be regenerated.</p>
          )}
        </div>
        <div className="space-y-1">
          <label className={toolLabelClass}>
            Guidance (optional)
          </label>
          <textarea
            value={rewriteGuidance}
            onChange={(event) => setRewriteGuidance(event.target.value)}
            maxLength={220}
            placeholder="Tone, intent, constraints..."
            className={`${toolInputClass} h-[104px] resize-none`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-gray-500">{rewriteGuidance.length}/220 chars</p>
            {isNarrowViewport && (
              <button
                type="button"
                onClick={() => {
                  setRewriteMode('select');
                  setToolsSheet('collapsed');
                }}
                className="inline-flex items-center rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-200 transition-colors hover:bg-gray-800"
              >
                Change selection
              </button>
            )}
          </div>
          <Button
            onClick={() => {
              if (scriptController.rewriteTarget) {
                const guidance = rewriteGuidance.trim();
                void scriptController.rewriteBlock(scriptController.rewriteTarget.blockId, guidance);
              }
            }}
            disabled={
              !scriptController.rewriteTarget ||
              Boolean(selectedRewrite?.locked) ||
              scriptController.isRewriteComposerGenerating
            }
            size="sm"
            className="shadow-lg shadow-indigo-500/20"
            title="Regenerate the selected block"
          >
            Regenerate
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <p className="text-[10px] text-gray-500">Generate a script to unlock rewrite tools.</p>
  );
  const sceneEndAnchor = useMemo(() => {
    if (!context || context.scenes.length === 0) return null;
    const lastScene = context.scenes[context.scenes.length - 1];
    const lastBlock = lastScene.blocks[lastScene.blocks.length - 1];
    return lastBlock
      ? createAfterBlockAnchor(lastBlock.id)
      : createSceneTopAnchor(lastScene.id);
  }, [context]);
  const insertContent = context ? (
    <InsertBlock
      characters={context.characters}
      sceneEndAnchor={sceneEndAnchor}
      onInsertAtAnchor={onInsertAtAnchor}
      onGenerateInsertAtAnchor={onGenerateInsertAtAnchor}
      insertCompleteToken={insertCompleteToken}
      onError={onInsertError}
      disabled={isPlaying || isGenerating}
    />
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to unlock insert tools.</p>
  );
  const playbackContent = context && playbackProps ? (
    <PlaybackPanel {...playbackProps} />
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to begin playback.</p>
  );

  const mobilePlaybackTargetHeight = isMobileFloatingPlaybackVisible
    ? (isPlaybackExpanded ? MOBILE_PLAYBACK_SHEET_EXPANDED_MAX : `${MOBILE_PLAYBACK_SHEET_COLLAPSED_PX}px`)
    : '0px';
  const isDesktopFloatingPlaybackVisible = Boolean(context && playbackProps && !mobileSheetEnabled);
  const desktopPlaybackTargetHeight = isDesktopFloatingPlaybackVisible
    ? (isPlaybackExpanded ? DESKTOP_PLAYBACK_SHEET_EXPANDED_MAX : `${DESKTOP_PLAYBACK_SHEET_COLLAPSED_PX}px`)
    : '0px';
  const mobileStandardToolSheetMaxHeight = currentTool === 'generate'
    ? MOBILE_GENERATE_SHEET_MAX_HEIGHT
    : MOBILE_TOOL_SHEET_MAX_HEIGHT;
  const mobileStandardToolSheetTestId = isMobileStandardToolSheetVisible && currentTool
    ? `mobile-tool-sheet-${currentTool}`
    : undefined;
  const mobileStandardToolSheetContent = currentTool === 'generate'
    ? generateContent
    : currentTool === 'insert'
      ? insertContent
      : currentTool === 'rewrite'
        ? rewriteContent
        : currentTool === 'voices'
          ? (voicesContent ?? <p className="text-[11px] text-gray-500">Voices panel unavailable.</p>)
          : null;
  const mobileOverlayHeight = isMobileFloatingPlaybackVisible ? mobilePlaybackTargetHeight : '0px';
  const mobileBottomPadding = mobileSheetEnabled
    ? `calc(${MOBILE_TOOLS_DOCK_PADDING} + ${mobileOverlayHeight})`
    : undefined;
  const handleTogglePlaybackExpanded = () => setIsPlaybackExpanded(prev => !prev);

  return (
    <section
      className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-[#1a1a1a]"
      style={mobileBottomPadding ? { paddingBottom: mobileBottomPadding } : undefined}
    >
      {context && (
        <div
          className="shrink-0 border-b border-gray-800 bg-gray-900/40"
        >
          <div className="max-w-7xl mx-auto px-6 max-[900px]:px-4 max-[640px]:px-3 py-2.5">
            <div className="grid grid-cols-1 gap-3 max-[900px]:gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="space-y-1 min-w-0">
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
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[10px] uppercase font-semibold tracking-[0.24em] text-gray-500">Style</span>
                  <span className="text-sm font-medium text-gray-200">{styleLabel || 'No style set'}</span>
                  {onSaveStyle && (
                    <button
                      type="button"
                      onClick={handleOpenStyleModal}
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-indigo-400 hover:text-indigo-300"
                      title="Edit style"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit style
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 text-center min-w-0">
                <span className="text-[10px] uppercase font-semibold tracking-[0.24em] text-gray-500">Draft Title</span>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  <span className="text-base font-semibold text-white break-words">
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
              <div className="flex items-center justify-start lg:justify-end min-w-0">
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
                  <div className="relative" ref={exportMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsExportMenuOpen((previous) => !previous)}
                      disabled={!canExport}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[12rem] rounded-lg border border-gray-700 bg-gray-950/95 p-2 shadow-[0_18px_38px_rgba(0,0,0,0.42)] backdrop-blur"
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {context ? (
          <div className={contentWrapperClassName}>
            {isMobileRewriteSelectMode && (
              <div className="rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100">
                Select rewrite target: tap a block in the script.
              </div>
            )}
            {errorBanner}

            <div className="flex flex-col gap-2 flex-1 min-h-0 min-w-0">
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
      {context && !mobileSheetEnabled && (
        <BottomToolbelt
          activeTool={currentTool}
          onSelectTool={handleDesktopToolSelect}
          onCloseTool={handleToolClose}
          visibleTools={LEGACY_TOOL_ORDER}
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
      {isMenuSheetOpen && (
        <MobileBottomSheet
          title="Tools"
          maxHeight={MOBILE_MENU_SHEET_MAX_HEIGHT}
          bodyClassName="p-3"
          onBackdropClick={() => setToolsSheet('collapsed')}
          sheetTestId="mobile-tools-menu-sheet"
        >
          <div className="grid grid-cols-1 gap-2">
            {LEGACY_TOOL_ORDER.map((tool) => {
              const isActive = currentTool === tool;
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => handleSelectToolFromMenu(tool)}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? 'border-indigo-400 bg-indigo-500 text-white'
                      : 'border-gray-700 bg-gray-900/55 text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {TOOL_LABELS[tool]}
                </button>
              );
            })}
          </div>
        </MobileBottomSheet>
      )}
      {isMobileStandardToolSheetVisible && currentTool && (
        <MobileBottomSheet
          title={TOOL_LABELS[currentTool]}
          maxHeight={mobileStandardToolSheetMaxHeight}
          bodyClassName="px-4 py-3"
          onBackdropClick={handleMobileToolPanelClose}
          onClose={handleMobileToolPanelClose}
          closeLabel="Close tool panel"
          sheetTestId={mobileStandardToolSheetTestId}
        >
          {mobileStandardToolSheetContent}
        </MobileBottomSheet>
      )}
      {isMobileFloatingPlaybackVisible && playbackProps && (
        <div
          className={`fixed inset-x-0 ${MOBILE_TOOLS_DOCK_OFFSET_CLASS} z-[75] px-2.5 transition-[height] duration-200 ease-out`}
          style={{
            height: mobilePlaybackTargetHeight
          }}
          data-testid="playback-mini-player"
        >
          <PlaybackMiniPlayer
            {...playbackProps}
            isExpanded={isPlaybackExpanded}
            onToggleExpanded={handleTogglePlaybackExpanded}
            onClose={() => {}}
            showCloseButton={false}
          />
        </div>
      )}
      {isDesktopFloatingPlaybackVisible && playbackProps && (
        <div
          className="fixed bottom-3 right-3 z-[75] w-[min(30rem,calc(100vw-1.25rem))] transition-[height] duration-200 ease-out"
          style={{
            height: desktopPlaybackTargetHeight
          }}
          data-testid="desktop-floating-playback"
        >
          <PlaybackMiniPlayer
            {...playbackProps}
            isExpanded={isPlaybackExpanded}
            onToggleExpanded={handleTogglePlaybackExpanded}
            onClose={() => {}}
            showCloseButton={false}
          />
        </div>
      )}
      {mobileSheetEnabled && (
        <div className="fixed inset-x-0 bottom-0 z-[74] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="w-full border-t border-gray-700 bg-gray-950 shadow-[0_16px_40px_rgba(0,0,0,0.38)]">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={handleToggleMobileDock}
                className="flex-1 min-h-[42px] rounded-xl border border-gray-700 bg-gray-900/55 px-3 py-2 text-left transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-200">Tools</p>
                <p className="text-[11px] text-gray-400">{mobileDockLabel}</p>
              </button>
              {currentTool && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleActiveToolDismiss();
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                  aria-label="Close active tool"
                  title="Close active tool"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
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
