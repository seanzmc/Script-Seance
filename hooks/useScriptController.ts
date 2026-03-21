import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBlock } from '../domain/blocks';
import { BlockType, ScriptAnchor, ScriptBlock, ScriptSelectionTarget, StoryContext } from '../types';
import {
  resolveInsertIndexFromAnchor,
  ScriptBlockPatch,
  ScriptBlockTarget,
  ScriptController
} from '../services/scriptController';

export interface RewriteOption {
  sceneId: string;
  blockId: string;
  type: BlockType;
  label: string;
  displayText: string;
}

export interface UseScriptControllerParams {
  context: StoryContext | null;
  insertModeActive: boolean;
  rewriteAutoSelectEnabled: boolean;
  onGenerateNext?: () => void;
  onDeleteBlock?: (sceneId: string, blockId: string) => void;
  onRequestInsert?: (anchor: ScriptAnchor) => void;
  onInsertAtAnchor?: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  onGenerateInsertAtAnchor?: (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => Promise<void>;
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
}

export interface UseScriptControllerResult extends ScriptController {
  rewriteTarget: ScriptBlockTarget | null;
  rewriteOptions: RewriteOption[];
  setRewriteTarget: (target: ScriptBlockTarget | null) => void;
  selectedTarget: ScriptSelectionTarget | null;
  selectedBlockTarget: ScriptBlockTarget | null;
  selectBlockTarget: (target: ScriptBlockTarget) => void;
  selectSceneHeading: (sceneId: string) => void;
  clearBlockTarget: () => void;
  activeInsertAnchor?: ScriptAnchor;
  activeInsertIndex: number | null;
  requestInsert: (anchor: ScriptAnchor) => void;
  closeInsertComposer: () => void;

  composerBlockType: BlockType;
  setComposerBlockType: (next: BlockType) => void;
  composerCharacter: string;
  setComposerCharacter: (next: string) => void;
  composerContent: string;
  setComposerContent: (next: string) => void;
  composerError: string | null;
  isComposerGenerating: boolean;
  insertAtActiveAnchor: () => void;
  generateInsertAtActiveAnchor: () => Promise<void>;

  rewriteComposerTarget: ScriptBlockTarget | null;
  rewriteInstructions: string;
  setRewriteInstructions: (next: string) => void;
  rewriteCandidateText: string;
  rewriteComposerError: string | null;
  isRewriteComposerGenerating: boolean;
  activeRewriteBlockId?: string;
  closeRewriteComposer: () => void;
  generateRewritePreview: () => Promise<void>;
  applyRewritePreview: () => void;

  deleteBlock: (target: ScriptBlockTarget) => void;
}

const findTargetByBlockId = (context: StoryContext | null, blockId: string): ScriptBlockTarget | null => {
  if (!context) return null;
  for (const scene of context.scenes) {
    const found = scene.blocks.some((block) => block.id === blockId);
    if (found) {
      return { sceneId: scene.id, blockId };
    }
  }
  return null;
};

export const useScriptController = ({
  context,
  insertModeActive,
  rewriteAutoSelectEnabled,
  onGenerateNext,
  onDeleteBlock,
  onRequestInsert,
  onInsertAtAnchor,
  onGenerateInsertAtAnchor,
  onGenerateRewritePreview,
  onApplyRewritePreview
}: UseScriptControllerParams): UseScriptControllerResult => {
  const [rewriteTarget, setRewriteTargetState] = useState<ScriptBlockTarget | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<ScriptSelectionTarget | null>(null);
  const [rewriteComposerTarget, setRewriteComposerTarget] = useState<ScriptBlockTarget | null>(null);
  const [rewriteInstructions, setRewriteInstructionsState] = useState('');
  const [rewriteCandidateText, setRewriteCandidateText] = useState('');
  const [rewriteComposerError, setRewriteComposerError] = useState<string | null>(null);
  const [isRewriteComposerGenerating, setIsRewriteComposerGenerating] = useState(false);

  const [activeInsertAnchor, setActiveInsertAnchor] = useState<ScriptAnchor | null>(null);
  const [composerBlockType, setComposerBlockTypeState] = useState<BlockType>(BlockType.ACTION);
  const [composerCharacter, setComposerCharacterState] = useState('');
  const [composerContent, setComposerContentState] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isComposerGenerating, setIsComposerGenerating] = useState(false);

  const script = context?.scenes ?? [];
  const activeInsertIndex = useMemo(() => {
    if (!context || !activeInsertAnchor) return null;
    return resolveInsertIndexFromAnchor(context, activeInsertAnchor);
  }, [activeInsertAnchor, context]);
  const activeRewriteBlockId = rewriteComposerTarget?.blockId;
  const selectedBlockTarget = selectedTarget?.kind === 'block'
    ? { sceneId: selectedTarget.sceneId, blockId: selectedTarget.blockId }
    : null;
  const selectedBlockId = selectedBlockTarget?.blockId;

  const rewriteOptions = useMemo<RewriteOption[]>(() => {
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
          type: block.type,
          label,
          displayText: displayText || '(No text)'
        };
      })
    ));
  }, [context]);

  const setRewriteTarget = useCallback((target: ScriptBlockTarget | null) => {
    setRewriteTargetState(target);
  }, []);

  const clearRewriteComposerFields = useCallback(() => {
    setRewriteComposerTarget(null);
    setRewriteComposerError(null);
    setRewriteCandidateText('');
    setRewriteInstructionsState('');
  }, []);

  const closeInsertComposer = useCallback(() => {
    if (isComposerGenerating) return;
    setActiveInsertAnchor(null);
    setComposerError(null);
  }, [isComposerGenerating]);

  const closeRewriteComposer = useCallback(() => {
    if (isRewriteComposerGenerating) return;
    clearRewriteComposerFields();
  }, [clearRewriteComposerFields, isRewriteComposerGenerating]);

  const closeComposer = useCallback(() => {
    closeInsertComposer();
    closeRewriteComposer();
  }, [closeInsertComposer, closeRewriteComposer]);

  const selectBlockTarget = useCallback((target: ScriptBlockTarget) => {
    setSelectedTarget({ kind: 'block', sceneId: target.sceneId, blockId: target.blockId });
    setRewriteTargetState(target);
  }, []);

  const selectSceneHeading = useCallback((sceneId: string) => {
    setSelectedTarget({ kind: 'scene-heading', sceneId });
    setActiveInsertAnchor(null);
    setComposerError(null);
    clearRewriteComposerFields();
  }, [clearRewriteComposerFields]);

  const clearBlockTarget = useCallback(() => {
    setSelectedTarget(null);
  }, []);

  const openInsert = useCallback((anchor: ScriptAnchor) => {
    if (isComposerGenerating) return;
    clearRewriteComposerFields();
    setActiveInsertAnchor(anchor);
    setComposerError(null);
    onRequestInsert?.(anchor);
  }, [clearRewriteComposerFields, isComposerGenerating, onRequestInsert]);

  const requestInsert = useCallback((anchor: ScriptAnchor) => {
    if (activeInsertAnchor?.id === anchor.id) {
      closeInsertComposer();
      return;
    }
    openInsert(anchor);
  }, [activeInsertAnchor, closeInsertComposer, openInsert]);

  const openRewrite = useCallback((target: ScriptBlockTarget) => {
    if (isComposerGenerating) return;
    setRewriteTargetState(target);
    setSelectedTarget({ kind: 'block', sceneId: target.sceneId, blockId: target.blockId });
    setActiveInsertAnchor(null);
    setComposerError(null);
    setRewriteComposerTarget(target);
    setRewriteInstructionsState('');
    setRewriteCandidateText('');
    setRewriteComposerError(null);
  }, [isComposerGenerating]);

  const insertBlock = useCallback((anchor: ScriptAnchor, block: ScriptBlock) => {
    if (!onInsertAtAnchor) {
      setComposerError('Insert handler unavailable.');
      return;
    }
    onInsertAtAnchor(anchor, block);
    setComposerContentState('');
    setComposerError(null);
    setActiveInsertAnchor(null);
  }, [onInsertAtAnchor]);

  const insertAtActiveAnchor = useCallback(() => {
    if (!context) {
      setComposerError('Script context unavailable.');
      return;
    }
    if (activeInsertAnchor === null) return;
    if (composerBlockType === BlockType.DIALOGUE && !composerCharacter) {
      setComposerError('Add a character first.');
      return;
    }
    const trimmedContent = composerContent.trim();
    if (!trimmedContent) {
      setComposerError('Add content before inserting manually.');
      return;
    }
    const block: ScriptBlock = createBlock({
      type: composerBlockType,
      text: trimmedContent,
      character: composerBlockType === BlockType.DIALOGUE ? composerCharacter : undefined
    });
    insertBlock(activeInsertAnchor, block);
  }, [activeInsertAnchor, composerBlockType, composerCharacter, composerContent, context, insertBlock]);

  const generateInsertAtActiveAnchor = useCallback(async () => {
    if (!context) {
      setComposerError('Script context unavailable.');
      return;
    }
    if (activeInsertAnchor === null) return;
    if (!onGenerateInsertAtAnchor) {
      setComposerError('Generate handler unavailable.');
      return;
    }
    if (composerBlockType === BlockType.DIALOGUE && !composerCharacter) {
      setComposerError('Add a character first.');
      return;
    }
    setComposerError(null);
    setIsComposerGenerating(true);
    try {
      await onGenerateInsertAtAnchor({
        anchor: activeInsertAnchor,
        type: composerBlockType,
        content: composerContent.trim(),
        character: composerBlockType === BlockType.DIALOGUE
          ? composerCharacter
          : undefined
      });
      setComposerContentState('');
      setActiveInsertAnchor(null);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Failed to generate insert block.';
      setComposerError(message);
    } finally {
      setIsComposerGenerating(false);
    }
  }, [
    activeInsertAnchor,
    composerBlockType,
    composerCharacter,
    composerContent,
    context,
    onGenerateInsertAtAnchor
  ]);

  const runRewritePreview = useCallback(async (target: ScriptBlockTarget, instructions: string) => {
    if (!onGenerateRewritePreview) {
      setRewriteComposerError('Rewrite preview handler unavailable.');
      return;
    }
    setRewriteComposerError(null);
    setIsRewriteComposerGenerating(true);
    try {
      const generated = await onGenerateRewritePreview({
        sceneId: target.sceneId,
        blockId: target.blockId,
        instructions: instructions.trim()
      });
      const normalized = generated.trim();
      if (!normalized) {
        setRewriteComposerError('AI returned empty rewrite content.');
        setRewriteCandidateText('');
        return;
      }
      setRewriteCandidateText(normalized);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Failed to generate rewrite.';
      setRewriteComposerError(message);
    } finally {
      setIsRewriteComposerGenerating(false);
    }
  }, [onGenerateRewritePreview]);

  const generateRewritePreview = useCallback(async () => {
    if (!rewriteComposerTarget) return;
    await runRewritePreview(rewriteComposerTarget, rewriteInstructions);
  }, [rewriteComposerTarget, rewriteInstructions, runRewritePreview]);

  const applyRewritePreview = useCallback(() => {
    if (!rewriteComposerTarget) return;
    if (!onApplyRewritePreview) {
      setRewriteComposerError('Rewrite apply handler unavailable.');
      return;
    }
    const candidate = rewriteCandidateText.trim();
    if (!candidate) {
      setRewriteComposerError('Generate a rewrite before applying.');
      return;
    }
    onApplyRewritePreview({
      sceneId: rewriteComposerTarget.sceneId,
      blockId: rewriteComposerTarget.blockId,
      text: candidate
    });
    clearRewriteComposerFields();
  }, [clearRewriteComposerFields, onApplyRewritePreview, rewriteCandidateText, rewriteComposerTarget]);

  const rewriteBlock = useCallback(async (blockId: string, prompt: string) => {
    const target = findTargetByBlockId(context, blockId);
    if (!target) {
      setRewriteComposerError('Selected block is no longer available.');
      return;
    }
    setRewriteTargetState(target);
    setSelectedTarget({ kind: 'block', sceneId: target.sceneId, blockId: target.blockId });
    setRewriteComposerTarget(target);
    setRewriteInstructionsState(prompt);
    await runRewritePreview(target, prompt);
  }, [context, runRewritePreview]);

  const updateBlock = useCallback((blockId: string, patch: ScriptBlockPatch) => {
    if (!onApplyRewritePreview) return;
    if (typeof patch.text !== 'string') return;
    const target = findTargetByBlockId(context, blockId);
    if (!target) return;
    const text = patch.text.trim();
    if (!text) return;
    onApplyRewritePreview({
      sceneId: target.sceneId,
      blockId: target.blockId,
      text
    });
  }, [context, onApplyRewritePreview]);

  const deleteBlock = useCallback((target: ScriptBlockTarget) => {
    if (!onDeleteBlock) return;
    onDeleteBlock(target.sceneId, target.blockId);
    setSelectedTarget(null);
    setRewriteComposerTarget((current) => (
      current?.sceneId === target.sceneId && current?.blockId === target.blockId ? null : current
    ));
  }, [onDeleteBlock]);

  const generateNextScene = useCallback(async () => {
    onGenerateNext?.();
  }, [onGenerateNext]);

  const setComposerBlockType = useCallback((next: BlockType) => {
    setComposerBlockTypeState(next);
    if (next === BlockType.DIALOGUE && context?.characters.length && !composerCharacter) {
      setComposerCharacterState(context.characters[0]);
    }
    setComposerError(null);
  }, [composerCharacter, context]);

  const setComposerCharacter = useCallback((next: string) => {
    setComposerCharacterState(next);
    if (composerError) {
      setComposerError(null);
    }
  }, [composerError]);

  const setComposerContent = useCallback((next: string) => {
    setComposerContentState(next);
    if (composerError) {
      setComposerError(null);
    }
  }, [composerError]);

  const setRewriteInstructions = useCallback((next: string) => {
    setRewriteInstructionsState(next);
    if (rewriteComposerError) {
      setRewriteComposerError(null);
    }
  }, [rewriteComposerError]);

  useEffect(() => {
    if (!insertModeActive) return;
    setSelectedTarget(null);
    setActiveInsertAnchor(null);
    setComposerError(null);
    setIsComposerGenerating(false);
    clearRewriteComposerFields();
    setIsRewriteComposerGenerating(false);
  }, [clearRewriteComposerFields, insertModeActive]);

  useEffect(() => {
    if (context) return;
    setActiveInsertAnchor(null);
    setComposerError(null);
    setIsComposerGenerating(false);
    setComposerCharacterState('');
    clearRewriteComposerFields();
    setIsRewriteComposerGenerating(false);
  }, [clearRewriteComposerFields, context]);

  useEffect(() => {
    if (!context || context.characters.length === 0) {
      setComposerCharacterState('');
      return;
    }
    setComposerCharacterState((current) => (
      current && context.characters.includes(current) ? current : context.characters[0]
    ));
  }, [context]);

  useEffect(() => {
    if (rewriteOptions.length === 0) {
      setRewriteTargetState(null);
      setSelectedTarget(null);
      return;
    }
    if (!rewriteAutoSelectEnabled) {
      return;
    }
    if (!rewriteTarget || !rewriteOptions.some(option => option.blockId === rewriteTarget.blockId)) {
      const [first] = rewriteOptions;
      if (first) {
        setRewriteTargetState({ sceneId: first.sceneId, blockId: first.blockId });
      }
    }
  }, [rewriteAutoSelectEnabled, rewriteOptions, rewriteTarget]);

  useEffect(() => {
    if (selectedTarget?.kind !== 'block') return;
    const targetStillExists = rewriteOptions.some((option) => (
      option.sceneId === selectedTarget.sceneId && option.blockId === selectedTarget.blockId
    ));
    if (!targetStillExists) {
      setSelectedTarget(null);
    }
  }, [rewriteOptions, selectedTarget]);

  useEffect(() => {
    if (!rewriteComposerTarget) return;
    const targetStillExists = rewriteOptions.some((option) => (
      option.sceneId === rewriteComposerTarget.sceneId && option.blockId === rewriteComposerTarget.blockId
    ));
    if (targetStillExists) return;
    clearRewriteComposerFields();
  }, [clearRewriteComposerFields, rewriteComposerTarget, rewriteOptions]);

  useEffect(() => {
    if (!activeInsertAnchor || !context) return;
    if (activeInsertIndex !== null) return;
    setActiveInsertAnchor(null);
  }, [activeInsertAnchor, activeInsertIndex, context]);

  return {
    script,
    selectedBlockId,
    selectedTarget,
    selectedBlockTarget,
    activeInsertAnchor: activeInsertAnchor ?? undefined,
    activeRewriteBlockId,
    rewriteTarget,
    rewriteOptions,
    setRewriteTarget,
    selectBlockTarget,
    selectSceneHeading,
    clearBlockTarget,
    requestInsert,
    activeInsertIndex,
    openInsert,
    closeInsertComposer,

    composerBlockType,
    setComposerBlockType,
    composerCharacter,
    setComposerCharacter,
    composerContent,
    setComposerContent,
    composerError,
    isComposerGenerating,
    insertAtActiveAnchor,
    generateInsertAtActiveAnchor,
    insertBlock,

    rewriteComposerTarget,
    rewriteInstructions,
    setRewriteInstructions,
    rewriteCandidateText,
    rewriteComposerError,
    isRewriteComposerGenerating,
    openRewrite,
    closeRewriteComposer,
    generateRewritePreview,
    applyRewritePreview,
    rewriteBlock,
    updateBlock,

    generateNextScene,
    closeComposer,
    deleteBlock
  };
};
