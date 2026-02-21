import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockType, StoryContext, ScriptBlock } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertBlock } from './InsertBlock';
import { Button } from './Button';
import { SetupForm, SetupFormState } from './SetupForm';
import { BottomToolbelt, ToolKey } from './BottomToolbelt';
import { PlaybackMiniPlayer, PlaybackPanel, PlaybackPanelProps } from './PlaybackPanel';
import { TitleEditModal } from './TitleEditModal';
import { AlertCircle, Download, FileDown, Loader2, Sparkles, PlusCircle, X, Pencil, Undo2, Redo2 } from 'lucide-react';

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
const MOBILE_EXPORT_SHEET_ESTIMATED_PX = 152;
const MOBILE_EXPORT_SHEET_ESTIMATED_HEIGHT = `${MOBILE_EXPORT_SHEET_ESTIMATED_PX}px`;
const MOBILE_EXPORT_SHEET_MAX_HEIGHT = 'min(208px, 40vh)';
const MOBILE_EXPORT_SHEET_BODY_MAX_HEIGHT = 'calc(min(208px, 40vh) - 48px)';
const MOBILE_MENU_SHEET_MAX_HEIGHT = '50vh';
const MOBILE_MENU_SHEET_BODY_MAX_HEIGHT = 'calc(50vh - 48px)';
const TOOL_ORDER: ToolKey[] = ['generate', 'insert', 'rewrite', 'voices', 'playback', 'export'];
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
  bodyMaxHeight: string;
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
  bodyMaxHeight,
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
      <div
        className="w-full overflow-hidden rounded-t-2xl border border-gray-800 bg-gray-950 shadow-[0_22px_56px_rgba(0,0,0,0.45)]"
        style={{ maxHeight }}
        data-testid={sheetTestId}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gray-400">{title}</p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className={`${bodyClassName} overflow-y-auto`} style={{ maxHeight: bodyMaxHeight }}>
          {children}
        </div>
      </div>
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
  const [rewriteTarget, setRewriteTarget] = useState<{ sceneId: string; blockId: string } | null>(null);
  const [rewriteGuidance, setRewriteGuidance] = useState('');
  const [isPlaybackExpanded, setIsPlaybackExpanded] = useState(false);
  const lastInsertCompleteTokenRef = useRef(insertCompleteToken);
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
    <div className="h-full min-h-0 flex flex-col gap-2">
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
      {generationIndicator}
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Start a script to generate new scenes.</p>
  );
  const handleSelectRewriteTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    setRewriteTarget(target);
    if (isNarrowViewport && currentTool === 'rewrite') {
      setRewriteMode('configure');
      setToolsSheet('tool');
    }
  }, [currentTool, isNarrowViewport]);
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
      rewriteModeActive={currentTool === 'rewrite' && (!isNarrowViewport || rewriteMode === 'select')}
      onSelectRewriteTarget={handleSelectRewriteTarget}
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
    if (!isNarrowViewport || currentTool !== 'insert') return;
    if (insertModeActive) {
      setToolsSheet('collapsed');
    }
  }, [currentTool, insertModeActive, isNarrowViewport]);

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
  const isToolSheetOpen = mobileSheetEnabled
    && toolsSheet === 'tool'
    && Boolean(currentTool)
    && currentTool !== 'playback'
    && currentTool !== 'export';
  const isMobilePlaybackMiniVisible = mobileSheetEnabled
    && currentTool === 'playback'
    && toolsSheet === 'collapsed'
    && Boolean(playbackProps);
  const isMobileExportSheetVisible = mobileSheetEnabled
    && currentTool === 'export'
    && toolsSheet === 'tool';
  const isMobileRewriteSelectMode = mobileSheetEnabled && currentTool === 'rewrite' && rewriteMode === 'select';
  const activeToolLabel = currentTool ? TOOL_LABELS[currentTool] : null;
  const mobileDockLabel = isMenuSheetOpen
    ? 'Choose a tool'
    : isToolSheetOpen
      ? activeToolLabel ? `${activeToolLabel} open` : 'Tool panel open'
      : isMobileExportSheetVisible
        ? 'Export open'
      : currentTool === 'playback'
        ? isPlaybackExpanded ? 'Playback details open' : 'Playback mini-player open'
        : activeToolLabel ? `View ${activeToolLabel}` : 'Open tools';
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
  const focusScriptScroll = () => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  };
  const handleToolClose = () => {
    setCurrentTool(null);
    setToolsSheet('collapsed');
    setIsPlaybackExpanded(false);
    focusScriptScroll();
  };
  const handlePlaybackMiniClose = () => {
    playbackProps?.onStop();
    setCurrentTool(null);
    setToolsSheet('collapsed');
    setIsPlaybackExpanded(false);
    focusScriptScroll();
  };
  const handleMobileToolPanelClose = () => {
    if (mobileSheetEnabled && currentTool === 'playback') {
      setToolsSheet('collapsed');
      return;
    }
    handleToolClose();
  };
  const handleActiveToolDismiss = () => {
    if (mobileSheetEnabled && currentTool === 'playback') {
      handlePlaybackMiniClose();
      return;
    }
    handleToolClose();
  };
  const handleDesktopToolSelect = (tool: ToolKey) => {
    if (currentTool === tool) {
      handleToolClose();
      return;
    }
    if (tool !== 'playback') {
      setIsPlaybackExpanded(false);
    }
    setCurrentTool(tool);
    setRewriteMode('configure');
  };
  const handleSelectToolFromMenu = (tool: ToolKey) => {
    setCurrentTool(tool);
    if (tool !== 'playback') {
      setIsPlaybackExpanded(false);
    }
    if (tool === 'rewrite') {
      setRewriteMode('select');
      setRewriteTarget(null);
      setToolsSheet('collapsed');
      return;
    }
    if (tool === 'playback') {
      setRewriteMode('configure');
      setIsPlaybackExpanded(false);
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
        const label = `Scene ${sceneIndex + 1}: ${scene.heading} — ${typeLabel} ${blockIndex + 1}`;
        const dialogueText = [
          block.character?.trim() ? block.character.trim().toUpperCase() : '',
          block.parenthetical?.trim() || '',
          block.text
        ].filter(Boolean).join('\n');
        const displayText = block.type === BlockType.DIALOGUE ? dialogueText : block.text;
        return {
          sceneId: scene.id,
          blockId: block.id,
          label,
          locked: Boolean(block.locked),
          displayText: displayText || '(No text)'
        };
      })
    ));
  }, [context]);
  useEffect(() => {
    if (rewriteOptions.length === 0) {
      setRewriteTarget(null);
      return;
    }
    // Mobile rewrite select mode requires explicit target selection.
    if (isNarrowViewport && currentTool === 'rewrite' && rewriteMode === 'select') {
      return;
    }
    if (!rewriteTarget || !rewriteOptions.some(option => option.blockId === rewriteTarget.blockId)) {
      const [first] = rewriteOptions;
      if (first) {
        setRewriteTarget({ sceneId: first.sceneId, blockId: first.blockId });
      }
    }
  }, [currentTool, isNarrowViewport, rewriteMode, rewriteOptions, rewriteTarget]);
  const selectedRewrite = rewriteOptions.find(option => option.blockId === rewriteTarget?.blockId);
  const rewriteContent = context ? (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className={`${toolSectionClass} flex-1 min-h-0 flex flex-col`}>
        <p className="text-[10px] text-gray-500 shrink-0">
          {isNarrowViewport
            ? 'Selected block appears below. Use Change selection to pick another block.'
            : 'Click a block in the script to target rewrite.'}
        </p>
        <div className="px-0.5 py-0.5 space-y-1 shrink-0">
          <p className={toolLabelClass}>Selected Block</p>
          <p className="text-[11px] text-gray-400 break-words">{selectedRewrite?.label}</p>
          {selectedRewrite && (
            <div className="max-h-[34vh] overflow-y-auto overscroll-contain rounded-lg border border-gray-800 bg-gray-950/65 px-2.5 py-2">
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
        <div className="space-y-1 flex-1 min-h-0">
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
        <div className="flex items-center justify-between gap-3 shrink-0">
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
  const playbackContent = context && playbackProps ? (
    <PlaybackPanel {...playbackProps} />
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to begin playback.</p>
  );

  useEffect(() => {
    if (currentTool !== 'playback') {
      setIsPlaybackExpanded(false);
    }
  }, [currentTool]);

  useEffect(() => {
    if (!isNarrowViewport || currentTool !== 'playback') return;
    if (toolsSheet === 'tool') {
      setToolsSheet('collapsed');
    }
  }, [currentTool, isNarrowViewport, toolsSheet]);

  const playbackTargetHeight = isMobilePlaybackMiniVisible
    ? (isPlaybackExpanded ? MOBILE_PLAYBACK_SHEET_EXPANDED_MAX : `${MOBILE_PLAYBACK_SHEET_COLLAPSED_PX}px`)
    : '0px';
  const mobileOverlayHeight = isMobilePlaybackMiniVisible
    ? playbackTargetHeight
    : isMobileExportSheetVisible
      ? MOBILE_EXPORT_SHEET_ESTIMATED_HEIGHT
      : '0px';
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
          className={`shrink-0 border-b border-gray-800 bg-gray-900/40 ${isInsertModeView ? 'pointer-events-none opacity-60' : ''}`}
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
                {styleLabel && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-[10px] uppercase font-semibold tracking-[0.24em] text-gray-500">Style</span>
                    <span className="text-sm font-medium text-gray-200">{styleLabel}</span>
                  </div>
                )}
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`${context && isToolSheetOpen ? 'hidden' : 'flex-1 min-h-0 min-w-0 overflow-hidden'}`}>
        {context ? (
          <div className={contentWrapperClassName}>
            {isMobileRewriteSelectMode && (
              <div className="rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100">
                Select rewrite target: tap a block in the script.
              </div>
            )}
            {errorBanner}

            <div className="flex flex-col gap-2 flex-1 min-h-0 min-w-0">
              {insertModeToolbar}
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
          bodyMaxHeight={MOBILE_MENU_SHEET_BODY_MAX_HEIGHT}
          bodyClassName="p-3"
          onBackdropClick={() => setToolsSheet('collapsed')}
        >
          <div className="grid grid-cols-1 gap-2">
            {TOOL_ORDER.map((tool) => {
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
      {isToolSheetOpen && currentTool && (
        <div
          className="fixed inset-x-0 top-0 z-[76]"
          style={{ bottom: MOBILE_TOOLS_DOCK_BOTTOM }}
        >
          <div className="h-full w-full">
            <BottomToolbelt
              activeTool={currentTool}
              onSelectTool={handleDesktopToolSelect}
              onCloseTool={handleMobileToolPanelClose}
              showSelector={false}
              edgeToEdge
              mobileExpanded
              className="h-full px-0 pb-0"
              onExportTxt={onExportTxt}
              onExportPdf={onExportPdf}
              exportDisabled={!canExport}
              generateContent={generateContent}
              rewriteContent={rewriteContent}
              playbackContent={playbackContent}
              voicesContent={voicesContent}
              insertContent={insertContent}
            />
          </div>
        </div>
      )}
      {isMobilePlaybackMiniVisible && playbackProps && (
        <div
          className={`fixed inset-x-0 ${MOBILE_TOOLS_DOCK_OFFSET_CLASS} z-[75] px-2.5 transition-[height] duration-200 ease-out`}
          style={{
            height: playbackTargetHeight
          }}
          data-testid="playback-mini-player"
        >
          <PlaybackMiniPlayer
            {...playbackProps}
            isExpanded={isPlaybackExpanded}
            onToggleExpanded={handleTogglePlaybackExpanded}
            onClose={handlePlaybackMiniClose}
          />
        </div>
      )}
      {isMobileExportSheetVisible && (
        <MobileBottomSheet
          title="EXPORT"
          maxHeight={MOBILE_EXPORT_SHEET_MAX_HEIGHT}
          bodyMaxHeight={MOBILE_EXPORT_SHEET_BODY_MAX_HEIGHT}
          bodyClassName="px-4 py-2"
          onBackdropClick={handleMobileToolPanelClose}
          onClose={handleMobileToolPanelClose}
          closeLabel="Close export panel"
          sheetTestId="mobile-export-sheet"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Export options</p>
              <p className="text-[10px] text-gray-500">Current draft only</p>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={onExportTxt}
                disabled={!canExport}
                className="w-full text-xs"
                title="Export script as a .txt file"
              >
                <Download className="w-3 h-3 mr-2" />
                Export Script (.txt)
              </Button>
              {onExportPdf && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onExportPdf}
                  disabled={!canExport}
                  className="w-full text-xs"
                  title="Export script as a PDF via print dialog"
                >
                  <FileDown className="w-3 h-3 mr-2" />
                  Export PDF
                </Button>
              )}
            </div>
          </div>
        </MobileBottomSheet>
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
      {setupModal}
    </section>
  );
};
