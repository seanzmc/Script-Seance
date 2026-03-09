import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockType, ScriptAnchor, ScriptBlock, ScriptSelectionTarget, StoryContext } from '../types';
import { ScriptDisplay } from './ScriptDisplay';
import { InsertComposerPopover } from './InsertComposerPopover';
import { RewriteComposerPopover } from './RewriteComposerPopover';
import { Button } from './Button';
import {
  paperPopoverFieldClassName,
  paperPopoverShellClassName
} from './paperPopoverStyles';
import { STYLE_PRESETS } from './SetupForm';
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
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Redo2
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
  onSaveStyle?: (style: string) => void;
  onExportTxt: () => void;
  onExportPdf?: () => void;
  canExport: boolean;
  insertScrollTargetId: string | null;
  insertScrollToken: number;
}

const PROMPT_CHAR_LIMIT = 320;

type InlineTooltipProps = {
  label: string;
  children: React.ReactNode;
  wrapperClassName?: string;
};

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
  onSaveStyle,
  onExportTxt,
  onExportPdf,
  canExport,
  insertScrollTargetId,
  insertScrollToken
}) => {
  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);
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
  const headerMetaLabelClass = 'font-semibold text-gray-100';
  const headerMetaItemClass = 'inline-flex items-center gap-2 whitespace-nowrap';
  const headerMetaBulletClass = 'text-gray-500';
  const headerActionSlotClass = 'min-w-0 flex-1 xl:min-w-fit xl:flex-none';
  const headerToolButtonClass = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 xl:w-auto max-[1279px]:px-2.5 max-[820px]:h-10 max-[820px]:px-0';
  const headerToolTextClass = 'max-[820px]:sr-only';
  const headerPrimaryToolButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-400/40 bg-indigo-500/15 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:px-5 sm:text-sm xl:w-auto max-[1279px]:px-3 max-[820px]:h-10 max-[820px]:px-0';
  const headerActionRowsClass = 'flex w-full items-stretch gap-2 xl:w-auto xl:items-center';
  const toolLabelClass = 'text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300';
  const toolSectionClass = 'space-y-2';
  const toolInputClass = 'w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-500 shadow-inner';
  const draftSaveIndicator = (
    <InlineTooltip label="Draft saves locally" wrapperClassName="items-center text-emerald-200/90">
      <span role="img" aria-label="Draft saves locally" tabIndex={0} className="inline-flex items-center outline-none">
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
    </InlineTooltip>
  );
  const generationIndicator = (
    <div className="min-h-[2.5rem]">
      {isGenerating ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-400/20 bg-indigo-500/5 px-3 py-2 text-[11px] text-indigo-100">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            <span className="font-medium">Working on your request...</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
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

  const focusScriptScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  }, []);
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Keep prompts concise.</span>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Privacy
            </button>
            <span className="whitespace-nowrap">{sceneCountLabel}</span>
            {draftSaveIndicator}
          </div>
          {promptWarning && <span className="whitespace-nowrap">Trim prompts.</span>}
        </div>
      </div>
      <div className="grid gap-2">
        <InlineTooltip label="Generate the next section of the screenplay" wrapperClassName="flex w-full">
          <Button
            onClick={handleGenerateNext}
            disabled={isPlaying || isGenerating}
            className="justify-start shadow-lg shadow-indigo-500/20"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Generate / Continue Writing
          </Button>
        </InlineTooltip>
        <InlineTooltip label="Generate a plot twist" wrapperClassName="flex w-full">
          <Button
            onClick={handleGeneratePlotTwist}
            variant="secondary"
            size="sm"
            disabled={isGenerating}
            className="justify-start"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Plot Twist
          </Button>
        </InlineTooltip>
        <InlineTooltip label="Insert a new scene or beat at the current draft edge" wrapperClassName="flex w-full">
          <Button
            onClick={handleInsertSceneBeat}
            variant="secondary"
            size="sm"
            disabled={!sceneEndAnchor || isGenerating || isPlaying}
            className="justify-start"
          >
            <PlusCircle className="mr-2 h-3.5 w-3.5" />
            Insert Scene / New Beat
          </Button>
        </InlineTooltip>
      </div>
      {generationIndicator}
    </div>
  );
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
                        onClick={() => setIsGenerateMenuOpen((previous) => !previous)}
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
                    {isGenerateMenuOpen && (
                      <div
                        role="dialog"
                        aria-label="Generate menu"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-[85] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-700 bg-gray-950 p-4 shadow-[0_24px_48px_rgba(0,0,0,0.42)] max-[1100px]:left-0 max-[1100px]:right-auto"
                      >
                        {generatePanelContent}
                      </div>
                    )}
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
                {showInitialGeneration ? startGenerationCard : null}
              </div>
            </div>
          </>
        )}
      </div>
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
    </section>
  );
};
