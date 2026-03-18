import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockType, ScriptAnchor, ScriptBlock, ScriptSelectionTarget, StoryContext } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertComposerPopover } from './InsertComposerPopover';
import { RewriteComposerPopover } from './RewriteComposerPopover';
import { DraftComposerPanel } from './workspace/DraftComposerPanel';
import { DraftOutlinePanel } from './workspace/DraftOutlinePanel';
import { Button } from './Button';
import {
  paperPopoverFieldClassName,
  paperPopoverShellClassName
} from './paperPopoverStyles';
import {
  SetupForm,
  SetupFormState,
  SETUP_UI_TOKENS,
  STYLE_PRESETS
} from './SetupForm';
import { PlaybackPanel, PlaybackPanelProps } from './PlaybackPanel';
import { PlaybackMiniPlayer } from './PlaybackMiniPlayer';
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
  List,
  Loader2,
  Pencil,
  PlusCircle,
  Sparkles,
  Speech,
  Trash2,
  Undo2,
  Redo2,
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

type InlineTooltipProps = {
  label: string;
  children: React.ReactNode;
  wrapperClassName?: string;
};

const MOBILE_DIALOG_BREAKPOINT = 768;

const InlineTooltip = ({ label, children, wrapperClassName }: InlineTooltipProps) => (
  <span className={`group relative inline-flex ${wrapperClassName ?? ''}`.trim()}>
    {children}
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-[6] -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-gray-700 bg-gray-950/95 px-2 py-1 text-[10px] font-medium text-gray-100 opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
    >
      {label}
    </span>
  </span>
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
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false);
  const [isMobileDialogViewport, setIsMobileDialogViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_DIALOG_BREAKPOINT : false
  ));
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState('');
  const [insertPlacementTarget, setInsertPlacementTarget] = useState<ScriptSelectionTarget | null>(null);
  const [editingHeadingSceneId, setEditingHeadingSceneId] = useState<string | null>(null);
  const [headingDraft, setHeadingDraft] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [lastNavigatedSceneId, setLastNavigatedSceneId] = useState<string | null>(null);
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
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const previewClassName = 'w-full';
  const genreLabel = context?.genre ?? 'Genre';
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
  const styleLabel = context?.style?.trim() || '';
  const headerMetaLabelClass = 'font-semibold text-gray-100';
  const headerMetaItemClass = 'inline-flex items-center gap-2 whitespace-nowrap';
  const headerMetaBulletClass = 'text-gray-500';
  const headerActionSlotClass = 'min-w-0 flex-1 xl:min-w-fit xl:flex-none';
  const headerToolButtonClass = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 xl:w-auto max-[1279px]:px-2.5 max-[820px]:h-10 max-[820px]:px-0';
  const headerToolTextClass = 'max-[820px]:sr-only';
  const headerPrimaryToolButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-400/40 bg-indigo-500/15 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:px-5 sm:text-sm xl:w-auto max-[1279px]:px-3 max-[820px]:h-10 max-[820px]:px-0';
  const headerAudioButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-900/55 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:px-5 sm:text-sm xl:w-auto max-[1279px]:px-3 max-[820px]:h-10 max-[820px]:px-0';
  const headerActionRowsClass = 'flex w-full items-stretch gap-2 xl:w-auto xl:items-center';
  const showStartScreen = !context && !isGenerating;
  const showInitialGeneration = !context && isGenerating;
  const activeSceneId = useMemo(() => {
    if (!context || context.scenes.length === 0) {
      return null;
    }
    if (scriptController.selectedTarget?.sceneId) {
      return scriptController.selectedTarget.sceneId;
    }
    if (lastNavigatedSceneId && context.scenes.some((scene) => scene.id === lastNavigatedSceneId)) {
      return lastNavigatedSceneId;
    }
    return context.scenes[0]?.id ?? null;
  }, [context, lastNavigatedSceneId, scriptController.selectedTarget]);
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
    const isInsertComposerAnchoredToBlock = scriptController.activeInsertAnchor?.kind === 'block'
      && scriptController.activeInsertAnchor.blockId === target.blockId;
    const isSameSelectedBlock = scriptController.selectedTarget?.kind === 'block'
      && scriptController.selectedTarget.sceneId === target.sceneId
      && scriptController.selectedTarget.blockId === target.blockId;
    if (isInsertComposerAnchoredToBlock) {
      setInsertPlacementTarget(null);
      scriptController.closeInsertComposer();
      if (isSameSelectedBlock) {
        scriptController.clearBlockTarget();
        return;
      }
    }
    scriptController.selectBlockTarget(target);
  }, [scriptController]);
  const handleSelectSceneHeading = useCallback((sceneId: string) => {
    const isSameSelectedHeading = scriptController.selectedTarget?.kind === 'scene-heading'
      && scriptController.selectedTarget.sceneId === sceneId;
    const isInsertComposerAnchoredToScene = scriptController.activeInsertAnchor?.kind === 'scene'
      && scriptController.activeInsertAnchor.sceneId === sceneId;
    if (isInsertComposerAnchoredToScene) {
      setInsertPlacementTarget(null);
      scriptController.closeInsertComposer();
    }
    if (isSameSelectedHeading) {
      setEditingHeadingSceneId(null);
      scriptController.clearBlockTarget();
      return;
    }
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
    setEditingHeadingSceneId(null);
    scriptController.clearBlockTarget();
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
    const currentPlacement = scriptController.activeInsertAnchor?.kind === 'block'
      && scriptController.activeInsertAnchor.blockId === insertPlacementTarget.blockId
      ? scriptController.activeInsertAnchor.position
      : null;
    if (currentPlacement === next) {
      return;
    }
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
      className={`w-[min(24rem,calc(100vw-2rem))] ${paperPopoverShellClassName}`}
    >
      <div className="space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">Scene Heading</p>
          <h3 className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-gray-800">Edit Scene Heading</h3>
        </div>
        <input
          value={headingDraft}
          onChange={(event) => setHeadingDraft(event.target.value)}
          className={paperPopoverFieldClassName}
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateViewport = () => {
      setIsMobileDialogViewport(window.innerWidth < MOBILE_DIALOG_BREAKPOINT);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (context?.scenes.some((scene) => scene.id === lastNavigatedSceneId)) {
      return;
    }
    setLastNavigatedSceneId(null);
  }, [context, lastNavigatedSceneId]);

  useEffect(() => {
    if (context) return;
    setIsOutlineOpen(false);
  }, [context]);

  const focusScriptScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  }, []);
  const handleOpenOutline = useCallback(() => {
    setIsGenerateMenuOpen(false);
    setIsAudioDrawerOpen(false);
    setIsOutlineOpen((previous) => !previous);
  }, []);
  const handleCloseOutline = useCallback(() => {
    setIsOutlineOpen(false);
  }, []);
  const handleSelectOutlineScene = useCallback((sceneId: string) => {
    setLastNavigatedSceneId(sceneId);
    setInsertPlacementTarget(null);
    setEditingHeadingSceneId(null);
    scriptController.selectSceneHeading(sceneId);
    setIsOutlineOpen(false);
    requestAnimationFrame(() => {
      const sceneHeading = document.getElementById(`scene-heading-${sceneId}`);
      const sceneContainer = document.getElementById(`scene-${sceneId}`);
      const scrollTarget = sceneHeading ?? sceneContainer;
      if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    });
  }, [scriptController]);
  const handleOpenTitleModal = () => {
    if (isTitleModalOpen) {
      setIsTitleModalOpen(false);
      return;
    }
    setTitleDraft(context?.title ?? '');
    setIsTitleModalOpen(true);
  };
  const handleCloseTitleModal = () => {
    setIsTitleModalOpen(false);
  };
  const handleOpenStyleModal = () => {
    if (isStyleModalOpen) {
      setIsStyleModalOpen(false);
      return;
    }
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
  const showPlaybackMiniPlayer = Boolean(
    context
    && playbackProps
    && !isAudioDrawerOpen
    && playbackProps.totalCount > 0
    && (playbackProps.isPlaying || playbackProps.isPaused)
  );
  const contentWrapperClassName = 'max-w-[1240px] mx-auto w-full px-6 max-[900px]:px-4 max-[640px]:px-3 py-5 h-full min-h-0 flex flex-col gap-4';
  const handleGenerateNext = useCallback(() => {
    setIsGenerateMenuOpen(false);
    void scriptController.generateNextScene();
  }, [scriptController]);
  const handleGeneratePlotTwist = useCallback(() => {
    onPlotTwist();
  }, [onPlotTwist]);
  const handleInsertSceneBeat = useCallback(() => {
    if (!sceneEndAnchor) return;
    setIsGenerateMenuOpen(false);
    setInsertPlacementTarget(null);
    scriptController.requestInsert(sceneEndAnchor);
    focusScriptScroll();
  }, [focusScriptScroll, sceneEndAnchor, scriptController]);
  const composerPanelNode = (
    <DraftComposerPanel
      userInstruction={userInstruction}
      onInstructionChange={onInstructionChange}
      onGenerateNext={handleGenerateNext}
      onPlotTwist={handleGeneratePlotTwist}
      onInsertSceneBeat={handleInsertSceneBeat}
      isGenerating={isGenerating}
      isPlaying={isPlaying}
      onCancelGenerate={onCancelGenerate}
      error={error}
      insertSceneBeatDisabled={!sceneEndAnchor}
      onOpenPrivacy={onOpenPrivacy}
      sceneCountLabel={sceneCountLabel}
    />
  );
  const outlineDrawer = context && isOutlineOpen ? (
    <>
      <div
        className="fixed inset-0 z-[96] bg-black/45 backdrop-blur-[2px]"
        onClick={handleCloseOutline}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Scene outline"
        data-testid="scene-outline-drawer"
        className="fixed z-[97] flex flex-col border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] shadow-[24px_0_48px_rgba(0,0,0,0.42)] md:inset-y-0 md:left-0 md:w-full md:max-w-[24rem] md:border-r max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[75vh] max-md:rounded-t-[1.75rem] max-md:border-t"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-4 sm:px-5">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Scene Outline</p>
            <h2 className="text-lg font-semibold text-white">Navigate the draft</h2>
            <p className="text-[11px] text-gray-400">Jump between scenes without changing the main script layout.</p>
          </div>
          <button
            type="button"
            onClick={handleCloseOutline}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label="Close scene outline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <DraftOutlinePanel
            scenes={context.scenes}
            activeSceneId={activeSceneId}
            onSelectScene={handleSelectOutlineScene}
          />
        </div>
      </aside>
    </>
  ) : null;
  const generateMenuDialog = isGenerateMenuOpen ? (
    <>
      {isMobileDialogViewport ? (
        <>
          <div
            className="fixed inset-0 z-[84] bg-black/45 backdrop-blur-[1px]"
            onClick={() => setIsGenerateMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Generate menu"
            className="fixed inset-x-0 bottom-0 z-[85] rounded-t-[1.75rem] border border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] p-3 shadow-[0_-24px_48px_rgba(0,0,0,0.42)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Generate</p>
                <h3 className="text-sm font-semibold text-white">Draft composer</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGenerateMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label="Close generate menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {composerPanelNode}
          </div>
        </>
      ) : (
        <div
          role="dialog"
          aria-label="Generate menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[85] w-[min(28rem,calc(100vw-1.5rem))] rounded-[1.35rem] bg-gray-950 shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        >
          {composerPanelNode}
        </div>
      )}
    </>
  ) : null;
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
    if (!isOutlineOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOutlineOpen(false);
        focusScriptScroll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusScriptScroll, isOutlineOpen]);

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

  useEffect(() => {
    if (!isPlaying || !isAudioDrawerOpen) return;
    setIsAudioDrawerOpen(false);
    focusScriptScroll();
  }, [focusScriptScroll, isAudioDrawerOpen, isPlaying]);

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
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-200"
                    title="Edit title"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit Title
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-300">
                  <span className={headerMetaItemClass}>
                    <span><span className={headerMetaLabelClass}>Genre:</span> {genreLabel}</span>
                  </span>
                  <span className={headerMetaItemClass}>
                    <span aria-hidden="true" className={headerMetaBulletClass}>&bull;</span>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span><span className={headerMetaLabelClass}>Style:</span> {styleLabel || 'No style set'}</span>
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
                    </span>
                  </span>
                  {autosaveError && (
                    <span className={headerMetaItemClass}>
                      <span aria-hidden="true" className={headerMetaBulletClass}>&bull;</span>
                      <span className="text-amber-400">{autosaveError}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="relative flex w-full flex-col items-stretch gap-2 xl:w-auto xl:items-end xl:justify-start">
                <div className={headerActionRowsClass}>
                  <div className={headerActionSlotClass}>
                    <InlineTooltip label="Undo" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={headerToolButtonClass}
                        aria-label="Undo"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        <span className={headerToolTextClass}>Undo</span>
                      </button>
                    </InlineTooltip>
                  </div>
                  <div className={headerActionSlotClass}>
                    <InlineTooltip label="Redo" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={() => onRedo?.()}
                        disabled={!canRedo || !onRedo}
                        className={headerToolButtonClass}
                        aria-label="Redo"
                      >
                        <Redo2 className="h-3.5 w-3.5" />
                        <span className={headerToolTextClass}>Redo</span>
                      </button>
                    </InlineTooltip>
                  </div>
                  <div className={`relative ${headerActionSlotClass}`} ref={exportMenuRef}>
                    <InlineTooltip label="Export" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={() => setIsExportMenuOpen((previous) => !previous)}
                        disabled={!canExport}
                        className={headerToolButtonClass}
                        aria-haspopup="menu"
                        aria-expanded={isExportMenuOpen}
                        aria-label="Open export menu"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className={headerToolTextClass}>Export</span>
                      </button>
                    </InlineTooltip>
                    {isExportMenuOpen && (
                      <div
                        role="menu"
                        aria-label="Export options"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-[85] min-w-[12rem] rounded-xl border border-gray-700 bg-gray-950 p-2 shadow-[0_18px_38px_rgba(0,0,0,0.42)]"
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
                  <div className={headerActionSlotClass}>
                    <InlineTooltip label="Clear Draft" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={onClearDraft}
                        disabled={!context}
                        className={`${headerToolButtonClass} border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-60`}
                        aria-label="Clear Draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className={headerToolTextClass}>Clear Draft</span>
                      </button>
                    </InlineTooltip>
                  </div>
                </div>
                <div className={headerActionRowsClass}>
                  <div className={`relative ${headerActionSlotClass}`} ref={generateMenuRef}>
                    <InlineTooltip label="Generate Next Scene" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOutlineOpen(false);
                          setIsGenerateMenuOpen((previous) => !previous);
                        }}
                        disabled={isPlaying}
                        className={headerPrimaryToolButtonClass}
                        aria-haspopup="dialog"
                        aria-expanded={isGenerateMenuOpen}
                        aria-label="Open generate menu"
                      >
                        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span className={headerToolTextClass}>GENERATE NEXT SCENE</span>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform max-[940px]:hidden ${isGenerateMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </InlineTooltip>
                    {generateMenuDialog}
                  </div>
                  <div className={headerActionSlotClass}>
                    <InlineTooltip label="Scene outline" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={handleOpenOutline}
                        disabled={!context}
                        className={headerAudioButtonClass}
                        aria-haspopup="dialog"
                        aria-expanded={isOutlineOpen}
                        aria-label="Open scene outline"
                      >
                        <List className="h-4 w-4" />
                        <span className={headerToolTextClass}>Outline</span>
                      </button>
                    </InlineTooltip>
                  </div>
                  <div className={headerActionSlotClass}>
                    <InlineTooltip label="Audio" wrapperClassName="flex w-full xl:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOutlineOpen(false);
                          setIsAudioDrawerOpen(true);
                        }}
                        className={headerAudioButtonClass}
                        aria-haspopup="dialog"
                        aria-expanded={isAudioDrawerOpen}
                        aria-label="Open audio drawer"
                      >
                        <Speech className="h-4 w-4" />
                        <span className={headerToolTextClass}>Audio</span>
                      </button>
                    </InlineTooltip>
                  </div>
                </div>
                {isGenerating && (
                  <div className="pointer-events-none absolute right-0 top-full z-[6] mt-2 flex justify-end max-[940px]:left-1/2 max-[940px]:right-auto max-[940px]:-translate-x-1/2">
                    <div
                      aria-live="polite"
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-100 shadow-[0_14px_28px_rgba(15,23,42,0.24)]"
                    >
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
      {showPlaybackMiniPlayer && playbackProps && (
        <PlaybackMiniPlayer
          isPlaying={playbackProps.isPlaying}
          isPaused={playbackProps.isPaused}
          currentBlockIndex={playbackProps.currentBlockIndex}
          totalCount={playbackProps.totalCount}
          currentSpeaker={playbackProps.currentSpeaker}
          onPlay={playbackProps.onPlay}
          onPause={playbackProps.onPause}
          onResume={playbackProps.onResume}
          onStop={playbackProps.onStop}
          onPrev={playbackProps.onPrev}
          onNext={playbackProps.onNext}
          onOpenAudioDrawer={() => {
            setIsOutlineOpen(false);
            setIsAudioDrawerOpen(true);
          }}
        />
      )}
      {outlineDrawer}
      {context && isAudioDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[96] bg-black/55 backdrop-blur-[2px]"
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
            className="fixed inset-y-0 right-0 z-[97] flex w-full max-w-[28rem] flex-col border-l border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] shadow-[-24px_0_48px_rgba(0,0,0,0.42)]"
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
