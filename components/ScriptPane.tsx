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
import { useScriptController } from '../hooks/useScriptController';
import {
  createAfterBlockAnchor,
  createBeforeBlockAnchor,
  createSceneTopAnchor
} from '../services/scriptController';
import {
  AlertCircle,
  Loader2
} from 'lucide-react';

export interface DraftCanvasChromeBridge {
  canInsertSceneBeat: boolean;
  openInsertSceneBeat: () => void;
}

export interface ScriptPaneProps {
  context: StoryContext | null;
  error: string | null;
  onGenerateNext: () => void;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
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
  insertScrollTargetId: string | null;
  insertScrollToken: number;
  onChromeBridgeChange?: (bridge: DraftCanvasChromeBridge | null) => void;
}

export const ScriptPane: React.FC<ScriptPaneProps> = ({
  context,
  error,
  onGenerateNext,
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
  insertScrollTargetId,
  insertScrollToken,
  onChromeBridgeChange
}) => {
  const [insertPlacementTarget, setInsertPlacementTarget] = useState<ScriptSelectionTarget | null>(null);
  const [editingHeadingSceneId, setEditingHeadingSceneId] = useState<string | null>(null);
  const [headingDraft, setHeadingDraft] = useState('');
  const scriptController = useScriptController({
    context,
    insertModeActive: false,
    rewriteAutoSelectEnabled: true,
    onGenerateNext: () => {
      // Route visible composer and end-slot "Generate Next Scene" through the shared controller path.
      onGenerateNext();
    },
    onDeleteBlock,
    onRequestInsert,
    onInsertAtAnchor,
    onGenerateInsertAtAnchor,
    onGenerateRewritePreview,
    onApplyRewritePreview
  });
  const rateLimitHint = error?.toLowerCase().includes('rate limit');
  const previewClassName = 'w-full';
  const showInitialGeneration = !context && isGenerating;
  const startStateErrorBanner = !context && error ? (
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

  const openInsertSceneBeatRef = useRef<() => void>(() => {});
  const focusScriptScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
      scrollContainer?.focus({ preventScroll: true });
    });
  }, []);
  const sceneEndAnchor = useMemo(() => {
    if (!context || context.scenes.length === 0) return null;
    const lastScene = context.scenes[context.scenes.length - 1];
    const lastBlock = lastScene.blocks[lastScene.blocks.length - 1];
    return lastBlock
      ? createAfterBlockAnchor(lastBlock.id)
      : createSceneTopAnchor(lastScene.id);
  }, [context]);
  const contentWrapperClassName = 'mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-col px-4 py-4 sm:px-5 lg:px-6';
  const handleInsertSceneBeat = useCallback(() => {
    if (!sceneEndAnchor) return;
    setInsertPlacementTarget(null);
    scriptController.requestInsert(sceneEndAnchor);
    focusScriptScroll();
  }, [focusScriptScroll, sceneEndAnchor, scriptController]);
  const canInsertSceneBeat = Boolean(sceneEndAnchor);

  useEffect(() => {
    openInsertSceneBeatRef.current = handleInsertSceneBeat;
  }, [handleInsertSceneBeat]);

  useEffect(() => {
    if (!onChromeBridgeChange) return;
    onChromeBridgeChange({
      canInsertSceneBeat,
      openInsertSceneBeat: () => openInsertSceneBeatRef.current()
    });
    return () => onChromeBridgeChange(null);
  }, [canInsertSceneBeat, onChromeBridgeChange]);

  return (
    <section className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-[#17181c]">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {context ? (
          <div className={contentWrapperClassName}>
            <div className="flex flex-1 min-h-0 min-w-0 flex-col">
              <div className="flex-1 min-h-0 min-w-0">
                {previewSection}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center px-6 py-10">
              <div className="w-full max-w-2xl space-y-6">
                {startStateErrorBanner}
                {showInitialGeneration ? startGenerationCard : null}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
