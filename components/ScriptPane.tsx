import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { BlockType, RevealScrollMode, ScriptAnchor, ScriptBlock, ScriptSelectionTarget, StoryContext } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertComposerPopover } from './InsertComposerPopover';
import { RewriteComposerPopover } from './RewriteComposerPopover';
import { DraftComposerPanel } from './workspace/DraftComposerPanel';
import { Button } from './Button';
import {
  paperPopoverFieldClassName,
  paperPopoverShellClassName
} from './paperPopoverStyles';
import { SetupFormState, STYLE_PRESETS } from './SetupForm';
import { PlaybackPanel, PlaybackPanelProps } from './PlaybackPanel';
import { PlaybackMiniPlayer } from './PlaybackMiniPlayer';
import { TitleEditModal } from './TitleEditModal';
import { StyleEditModal } from './StyleEditModal';
import { useScriptController } from '../hooks/useScriptController';
import { useWorkspaceChrome } from '../hooks/useWorkspaceChrome';
import {
  createAfterBlockAnchor,
  createBeforeBlockAnchor,
  createSceneTopAnchor
} from '../services/scriptController';
import {
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import { fadeSlideYVariants } from './motion/primitives';
import { SceneOutlineDrawer } from './workspace/SceneOutlineDrawer';
import { WorkspaceAudioDrawer } from './workspace/WorkspaceAudioDrawer';
import { WorkspaceHeader } from './workspace/WorkspaceHeader';
import { WorkspaceSetupOverlay } from './workspace/WorkspaceSetupOverlay';
import {
  DEFAULT_SCENE_GENERATION_LOADING_COPY_TIER,
  SCENE_GENERATION_LOADING_COPY,
  SCENE_GENERATION_LOADING_COPY_INTERVAL_MS
} from './workspace/sceneGenerationLoadingCopy';

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
  revealScrollTargetId: string | null;
  revealScrollMode?: RevealScrollMode;
  revealScrollToken: number;
}

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
  revealScrollTargetId,
  revealScrollMode = 'default',
  revealScrollToken
}) => {
  const sceneGenerationLoadingMessages = SCENE_GENERATION_LOADING_COPY[DEFAULT_SCENE_GENERATION_LOADING_COPY_TIER];
  const [sceneGenerationLoadingCopyIndex, setSceneGenerationLoadingCopyIndex] = useState(0);
  const [insertPlacementTarget, setInsertPlacementTarget] = useState<ScriptSelectionTarget | null>(null);
  const [editingHeadingSceneId, setEditingHeadingSceneId] = useState<string | null>(null);
  const [headingDraft, setHeadingDraft] = useState('');
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
  const sceneCountLabel = context ? `${context.scenes.length} scenes` : '0 scenes';
  const showStartScreen = !context && !isGenerating;
  const showInitialGeneration = !context && isGenerating;
  const showSetupHandoffLoading = !isSetupOpen && showInitialGeneration;
  const showSetupSurface = isSetupOpen || showSetupHandoffLoading;
  const sceneGenerationLoadingMessage = isGenerating
    ? sceneGenerationLoadingMessages[sceneGenerationLoadingCopyIndex] ?? sceneGenerationLoadingMessages[0]
    : null;
  const focusScriptScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  }, []);
  const {
    isGenerateMenuOpen,
    isOutlineOpen,
    isAudioDrawerOpen,
    isMobileDialogViewport,
    isTitleModalOpen,
    titleDraft,
    setTitleDraft,
    isStyleModalOpen,
    styleDraft,
    setStyleDraft,
    isExportMenuOpen,
    lastNavigatedSceneId,
    setLastNavigatedSceneId,
    generateMenuRef,
    exportMenuRef,
    toggleGenerateMenu,
    closeGenerateMenu,
    toggleExportMenu,
    closeExportMenu,
    toggleOutline,
    closeOutline,
    openAudioDrawer,
    closeAudioDrawer,
    openTitleModal,
    closeTitleModal,
    openStyleModal,
    closeStyleModal
  } = useWorkspaceChrome({
    context,
    focusScriptScroll,
    isPlaying
  });
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
    <m.div
      className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-800 bg-gradient-to-b from-gray-900/80 via-gray-900/60 to-gray-900/30 p-10 md:p-12 text-center shadow-[0_0_60px_rgba(15,23,42,0.6)]"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeSlideYVariants}
    >
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
    </m.div>
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
      revealScrollTargetId={revealScrollTargetId}
      revealScrollMode={revealScrollMode}
      revealScrollToken={revealScrollToken}
    />
  ) : null;

  useEffect(() => {
    if (!isGenerating) {
      setSceneGenerationLoadingCopyIndex(0);
      return;
    }
    setSceneGenerationLoadingCopyIndex(0);
    if (sceneGenerationLoadingMessages.length <= 1) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setSceneGenerationLoadingCopyIndex((currentIndex) =>
        (currentIndex + 1) % sceneGenerationLoadingMessages.length
      );
    }, SCENE_GENERATION_LOADING_COPY_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGenerating, sceneGenerationLoadingMessages]);

  useEffect(() => {
    if (scriptController.activeInsertAnchor) return;
    setInsertPlacementTarget(null);
  }, [scriptController.activeInsertAnchor]);

  useEffect(() => {
    if (!editingHeadingSceneId || !context?.scenes.some((scene) => scene.id === editingHeadingSceneId)) {
      setEditingHeadingSceneId(null);
    }
  }, [context, editingHeadingSceneId]);

  const handleSelectOutlineScene = useCallback((sceneId: string) => {
    setLastNavigatedSceneId(sceneId);
    setInsertPlacementTarget(null);
    setEditingHeadingSceneId(null);
    scriptController.selectSceneHeading(sceneId);
    closeOutline();
    requestAnimationFrame(() => {
      const sceneHeading = document.getElementById(`scene-heading-${sceneId}`);
      const sceneContainer = document.getElementById(`scene-${sceneId}`);
      const scrollTarget = sceneHeading ?? sceneContainer;
      if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    });
  }, [closeOutline, scriptController, setLastNavigatedSceneId]);
  const handleSaveStyle = () => {
    onSaveStyle?.(styleDraft);
    closeStyleModal();
  };
  const handleSaveTitle = () => {
    const nextTitle = titleDraft.trim() || 'Untitled Screenplay';
    onTitleChange(nextTitle);
    closeTitleModal();
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
    closeGenerateMenu();
    void scriptController.generateNextScene();
  }, [closeGenerateMenu, scriptController]);
  const handleGeneratePlotTwist = useCallback(() => {
    onPlotTwist();
  }, [onPlotTwist]);
  const handleInsertSceneBeat = useCallback(() => {
    if (!sceneEndAnchor) return;
    closeGenerateMenu();
    setInsertPlacementTarget(null);
    scriptController.requestInsert(sceneEndAnchor);
    focusScriptScroll();
  }, [closeGenerateMenu, focusScriptScroll, sceneEndAnchor, scriptController]);
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
      loadingMessage={sceneGenerationLoadingMessage ?? undefined}
      insertSceneBeatDisabled={!sceneEndAnchor}
      onOpenPrivacy={onOpenPrivacy}
      sceneCountLabel={sceneCountLabel}
    />
  );
  return (
    <section className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-[#17181c]">
      {context && (
        <WorkspaceHeader
          context={context}
          autosaveError={autosaveError}
          canUndo={canUndo}
          canRedo={canRedo}
          canExport={canExport}
          isPlaying={isPlaying}
          isGenerating={isGenerating}
          isGenerateMenuOpen={isGenerateMenuOpen}
          isOutlineOpen={isOutlineOpen}
          isAudioDrawerOpen={isAudioDrawerOpen}
          isExportMenuOpen={isExportMenuOpen}
          onUndo={onUndo}
          onRedo={onRedo}
          onClearDraft={onClearDraft}
          onExportTxt={() => {
            onExportTxt();
            closeExportMenu();
          }}
          onExportPdf={onExportPdf ? () => {
            onExportPdf();
            closeExportMenu();
          } : undefined}
          onOpenTitleModal={() => openTitleModal(context.title ?? '')}
          onOpenStyleModal={onSaveStyle ? () => openStyleModal(context.style ?? '') : undefined}
          onToggleExportMenu={toggleExportMenu}
          onToggleGenerateMenu={toggleGenerateMenu}
          onOpenOutline={toggleOutline}
          onOpenAudioDrawer={openAudioDrawer}
          onCancelGenerate={onCancelGenerate}
          exportMenuRef={exportMenuRef}
          generateMenuRef={generateMenuRef}
          composerPanel={composerPanelNode}
        />
      )}

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {context ? (
            <m.div
              key="script-workspace"
              className={contentWrapperClassName}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={fadeSlideYVariants}
            >
              {errorBanner}

              <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0">
                <div className="flex-1 min-h-0 min-w-0">
                  {previewSection}
                </div>
              </div>
            </m.div>
          ) : (
            <m.div
              key="pre-context-state"
              className="flex-1 flex items-center justify-center px-6 py-10"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={fadeSlideYVariants}
            >
              <div className="w-full max-w-2xl space-y-6">
                {errorBanner}
                {showStartScreen ? startScreenCard : null}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {showPlaybackMiniPlayer && playbackProps ? (
          <m.div
            key="playback-mini-player"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fadeSlideYVariants}
          >
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
                openAudioDrawer();
              }}
            />
          </m.div>
        ) : null}
      </AnimatePresence>
      {context ? (
        <SceneOutlineDrawer
          scenes={context.scenes}
          activeSceneId={activeSceneId}
          isOpen={isOutlineOpen}
          isMobileDialogViewport={isMobileDialogViewport}
          onClose={() => closeOutline()}
          onSelectScene={handleSelectOutlineScene}
        />
      ) : null}
      <WorkspaceAudioDrawer
        isOpen={Boolean(context && isAudioDrawerOpen)}
        onClose={() => closeAudioDrawer({ focus: true })}
        playbackContent={playbackContent}
        voicesContent={voicesContent}
      />
      <TitleEditModal
        isOpen={isTitleModalOpen}
        value={titleDraft}
        onChange={setTitleDraft}
        onSave={handleSaveTitle}
        onClose={closeTitleModal}
        inputRef={titleInputRef}
      />
      <StyleEditModal
        isOpen={isStyleModalOpen}
        value={styleDraft}
        presets={STYLE_PRESETS}
        onChange={setStyleDraft}
        onSave={handleSaveStyle}
        onClose={closeStyleModal}
      />
      <WorkspaceSetupOverlay
        showSetupSurface={showSetupSurface}
        showSetupHandoffLoading={showSetupHandoffLoading}
        isSetupOpen={isSetupOpen}
        setupState={setupState}
        isGenerating={isGenerating}
        loadingMessage={sceneGenerationLoadingMessage ?? undefined}
        setupAutoSurprise={setupAutoSurprise}
        onCloseSetup={onCloseSetup}
        onCancelGenerate={onCancelGenerate}
        onSetupChange={onSetupChange}
        onSetupSurprise={onSetupSurprise}
        onStartSetup={onStartSetup}
        onSetupError={onSetupError}
      />
    </section>
  );
};
