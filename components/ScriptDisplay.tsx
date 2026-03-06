import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BlockType,
  INSERT_BOTTOM_ID,
  INSERT_TOP_ID,
  Scene,
  ScriptAnchor,
  ScriptBlock,
  ScriptSelectionTarget
} from '../types';
import { Lock, Unlock, PlusCircle } from 'lucide-react';
import { createAfterBlockAnchor, createSceneTopAnchor } from '../services/scriptController';
import { AnchoredPopover } from './AnchoredPopover';

export interface ScriptDisplayProps {
  scenes: Scene[];
  currentBlockId: string | null;
  currentBlockIndex: number;
  blockStatuses: Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>;
  showHighlights: boolean;
  autoScroll: boolean;
  onToggleLock: (sceneId: string, blockId: string) => void;
  onSelectInsertTarget: (target: { sceneId: string; blockId: string }) => void;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  characters: string[];
  insertTarget?: { sceneId: string; blockId: string } | null;
  rewriteTarget?: { sceneId: string; blockId: string } | null;
  rewriteModeActive?: boolean;
  onSelectRewriteTarget?: (target: { sceneId: string; blockId: string }) => void;
  insertModeActive?: boolean;
  pendingInsertBlock?: ScriptBlock | null;
  onConfirmInsertMode?: () => void;
  onCancelInsertMode?: () => void;
  className?: string;
  scrollable?: boolean;
  insertScrollTargetId?: string | null;
  insertScrollToken?: number;
  selectedTarget?: ScriptSelectionTarget | null;
  selectedBlockTarget?: { sceneId: string; blockId: string } | null;
  onSelectBlockTarget?: (target: { sceneId: string; blockId: string }) => void;
  onSelectSceneHeading?: (sceneId: string) => void;
  onClearBlockTarget?: () => void;
  onRewriteBlock?: (target: { sceneId: string; blockId: string }) => void;
  onOpenInsertFromSelection?: (target: ScriptSelectionTarget) => void;
  onEditSceneHeading?: (sceneId: string, heading: string) => void;
  onDeleteBlock?: (target: { sceneId: string; blockId: string }) => void;
  activeInsertAnchor?: ScriptAnchor;
  activeInsertIndex?: number | null;
  onRequestInsert?: (anchor: ScriptAnchor) => void;
  insertComposer?: React.ReactNode;
  onCloseInsertComposer?: () => void;
  activeRewriteBlockId?: string | null;
  rewriteComposer?: React.ReactNode;
  onCloseRewriteComposer?: () => void;
  activeHeadingSceneId?: string | null;
  headingEditor?: React.ReactNode;
}

const ACTIVE_CLASSES = 'ring-2 ring-emerald-500/65 bg-emerald-100/55';
const ERROR_CLASSES = 'border border-red-300/70 bg-red-50/60';
const INSERT_HIGHLIGHT_CLASSES = 'ring-2 ring-emerald-400/60 bg-emerald-100/40';
export const SCRIPT_EXPORT_ROOT_SELECTOR = '[data-script-export-root="true"]';

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

const SCRIPT_EXPORT_STYLES = `
  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    font-family: "Courier Prime", monospace;
    background: #111827;
    color: #111111;
    line-height: 1.5;
  }

  .font-screenplay {
    font-family: "Courier Prime", monospace;
  }

  .script-export-root {
    position: relative;
    max-width: 900px;
    margin: 24px auto;
    padding: 72px 72px;
    background: #f6f1e7;
    color: #111111;
    border: 1px solid #d6cdbd;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
    overflow: visible !important;
  }

  .script-export-content {
    position: relative;
    z-index: 1;
    overflow: visible !important;
  }

  .script-export-texture {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.03;
    background-repeat: repeat;
    background-image: url('/textures/cream-paper.svg');
  }

  .script-scene {
    margin-bottom: 32px;
  }

  .script-scene-heading {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 17px;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #d1d5db;
    padding-bottom: 6px;
    margin-bottom: 16px;
  }

  .script-block {
    margin: 0 0 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .script-block[data-block-type="action"] {
    line-height: 1.55;
  }

  .script-block[data-block-type="dialogue"] {
    max-width: 4.2in;
    margin: 12px auto 20px;
    text-align: center;
  }

  .script-dialogue-character {
    margin-top: 4px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .script-dialogue-parenthetical {
    font-style: italic;
    font-size: 0.92rem;
    margin: 2px 0;
  }

  .script-dialogue-text {
    white-space: pre-wrap;
    margin: 2px 0 14px;
  }

  .script-block[data-block-type="transition"] {
    text-align: right;
    text-transform: uppercase;
    font-weight: 700;
    padding-right: 8px;
  }

  .script-export-chrome {
    display: none !important;
  }

  .script-block-active {
    background: transparent !important;
    box-shadow: none !important;
  }

  @media print {
    body {
      background: #ffffff;
    }

    .script-export-root {
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
      max-width: none;
      background: #ffffff;
    }

    .script-export-texture {
      display: none !important;
    }

    @page {
      size: letter;
      margin: 0.9in 0.8in 0.9in 1in;
    }
  }
`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const buildScriptExportDocument = (scriptMarkup: string, title: string) => {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${safeTitle}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      <style>${SCRIPT_EXPORT_STYLES}</style>
    </head>
    <body>
      ${scriptMarkup}
      <script>
        window.addEventListener('load', () => {
          const ready = document.fonts ? document.fonts.ready : Promise.resolve();
          ready.then(() => {
            setTimeout(() => window.print(), 60);
          });
        });
      </script>
    </body>
  </html>`;
};

export const openScriptExportWindow = (scriptMarkup: string, title: string) => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildScriptExportDocument(scriptMarkup, title));
  printWindow.document.close();
  printWindow.focus();
  return true;
};

export const ScriptDisplay: React.FC<ScriptDisplayProps> = ({
  scenes,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  showHighlights,
  autoScroll,
  onToggleLock,
  onSelectInsertTarget,
  onConfirmInsertMode,
  onCancelInsertMode,
  characters,
  insertTarget,
  rewriteTarget = null,
  rewriteModeActive = false,
  onSelectRewriteTarget,
  insertModeActive = false,
  pendingInsertBlock = null,
  className = '',
  scrollable = false,
  insertScrollTargetId,
  insertScrollToken,
  selectedTarget = null,
  selectedBlockTarget = null,
  onSelectBlockTarget,
  onSelectSceneHeading,
  onClearBlockTarget,
  onRewriteBlock,
  onOpenInsertFromSelection,
  onEditSceneHeading,
  onDeleteBlock,
  activeInsertAnchor,
  activeInsertIndex = null,
  onRequestInsert,
  insertComposer,
  onCloseInsertComposer,
  activeRewriteBlockId = null,
  rewriteComposer,
  onCloseRewriteComposer,
  activeHeadingSceneId = null,
  headingEditor
}) => {
  const insertHighlightTimeoutRef = useRef<number | null>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [selectedAnchorElement, setSelectedAnchorElement] = useState<HTMLElement | null>(null);
  const [rewriteAnchorElement, setRewriteAnchorElement] = useState<HTMLElement | null>(null);
  const [insertAnchorElement, setInsertAnchorElement] = useState<HTMLElement | null>(null);
  const [headingEditorAnchorElement, setHeadingEditorAnchorElement] = useState<HTMLElement | null>(null);
  const playableBlockIds = useMemo(() => {
    const ids: string[] = [];
    scenes.forEach(scene => {
      scene.blocks.forEach(block => {
        ids.push(block.id);
      });
    });
    return ids;
  }, [scenes]);
  const activeBlockId =
    currentBlockIndex >= 0 && currentBlockIndex < playableBlockIds.length
      ? playableBlockIds[currentBlockIndex]
      : currentBlockId;
  const selectedBlockId = selectedTarget?.kind === 'block'
    ? selectedTarget.blockId
    : selectedBlockTarget?.blockId ?? null;
  const isRewriteComposerOpen = Boolean(activeRewriteBlockId && rewriteComposer);
  const isInsertMode = insertModeActive;
  const isRewriteMode = rewriteModeActive && !isInsertMode;
  const hasPendingPreview = Boolean(pendingInsertBlock && insertTarget);
  const isInlineInsertComposerOpen = Boolean(activeInsertAnchor && insertComposer);
  const blockOrderIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    playableBlockIds.forEach((blockId, index) => {
      indexMap.set(blockId, index);
    });
    return indexMap;
  }, [playableBlockIds]);
  const sceneStartIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    let offset = 0;
    scenes.forEach((scene) => {
      indexMap.set(scene.id, offset);
      offset += scene.blocks.length;
    });
    return indexMap;
  }, [scenes]);
  const getDisplayCharacter = useCallback((name?: string) => {
    if (!name) return '';
    const normalized = normalizeCharacterName(name);
    const matched = characters.find(char => normalizeCharacterName(char) === normalized);
    return matched ?? name;
  }, [characters]);
  const resolveBlockElement = useCallback((blockId: string) => {
    if (typeof document === 'undefined') return null;
    return document.getElementById(`block-${blockId}`);
  }, []);
  const resolveSceneHeadingElement = useCallback((sceneId: string) => {
    if (typeof document === 'undefined') return null;
    return document.getElementById(`scene-heading-${sceneId}`);
  }, []);
  const resolveInsertSlotElement = useCallback((anchorId: string) => {
    if (typeof document === 'undefined') return null;
    const node = document.querySelector(`[data-anchor-id="${anchorId}"]`);
    return node instanceof HTMLElement ? node : null;
  }, []);

  useLayoutEffect(() => {
    if (!selectedTarget) {
      setSelectedAnchorElement(null);
      return;
    }

    setSelectedAnchorElement(
      selectedTarget.kind === 'block'
        ? resolveBlockElement(selectedTarget.blockId)
        : resolveSceneHeadingElement(selectedTarget.sceneId)
    );
  }, [resolveBlockElement, resolveSceneHeadingElement, scenes, selectedTarget]);

  useLayoutEffect(() => {
    setRewriteAnchorElement(activeRewriteBlockId ? resolveBlockElement(activeRewriteBlockId) : null);
  }, [activeRewriteBlockId, resolveBlockElement, scenes]);

  useLayoutEffect(() => {
    if (!activeInsertAnchor) {
      setInsertAnchorElement(null);
      return;
    }

    const slotElement = resolveInsertSlotElement(activeInsertAnchor.id);
    if (slotElement) {
      setInsertAnchorElement(slotElement);
      return;
    }

    if (activeInsertAnchor.kind === 'block') {
      setInsertAnchorElement(resolveBlockElement(activeInsertAnchor.blockId));
      return;
    }

    if (activeInsertAnchor.kind === 'scene') {
      setInsertAnchorElement(resolveSceneHeadingElement(activeInsertAnchor.sceneId));
      return;
    }

    setInsertAnchorElement(null);
  }, [activeInsertAnchor, resolveBlockElement, resolveInsertSlotElement, resolveSceneHeadingElement, scenes]);

  useLayoutEffect(() => {
    setHeadingEditorAnchorElement(
      activeHeadingSceneId ? resolveSceneHeadingElement(activeHeadingSceneId) : null
    );
  }, [activeHeadingSceneId, resolveSceneHeadingElement, scenes]);

  useEffect(() => {
    if (autoScroll && activeBlockId) {
      const el = document.getElementById(`block-${activeBlockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeBlockId, autoScroll]);

  useEffect(() => {
    const activeClasses = ACTIVE_CLASSES.split(' ');
    document.querySelectorAll('.script-block-active').forEach((node) => {
      node.classList.remove('script-block-active', ...activeClasses);
    });
    if (!showHighlights || !activeBlockId) return;
    const el = document.getElementById(`block-${activeBlockId}`);
    if (el) {
      el.classList.add('script-block-active', ...activeClasses);
    }
  }, [activeBlockId, showHighlights]);

  useEffect(() => {
    if (!insertScrollTargetId) return;
    const el = document.getElementById(`block-${insertScrollTargetId}`);
    requestAnimationFrame(() => {
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        const scrollContainer = document.querySelector('[data-script-scroll="true"]') as HTMLElement | null;
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        }
        return;
      }
      const highlightClasses = INSERT_HIGHLIGHT_CLASSES.split(' ');
      el.classList.add(...highlightClasses);
      if (insertHighlightTimeoutRef.current) {
        window.clearTimeout(insertHighlightTimeoutRef.current);
      }
      insertHighlightTimeoutRef.current = window.setTimeout(() => {
        el.classList.remove(...highlightClasses);
      }, 1600);
    });
  }, [insertScrollTargetId, insertScrollToken]);

  useEffect(() => {
    if (isInsertMode || !selectedTarget || !onClearBlockTarget) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      const selectedElement = selectedTarget.kind === 'block'
        ? document.getElementById(`block-${selectedTarget.blockId}`)
        : document.getElementById(`scene-heading-${selectedTarget.sceneId}`);
      const inlineActionsElement = document.querySelector('[data-selected-actions="true"]');
      const rewriteComposerNode = document.querySelector('[data-rewrite-composer="true"]');
      const headingEditorNode = document.querySelector('[aria-label="Edit Scene Heading"]');
      if (selectedElement?.contains(targetNode) || inlineActionsElement?.contains(targetNode)) {
        return;
      }
      if (rewriteComposerNode?.contains(targetNode)) {
        return;
      }
      if (headingEditorNode?.contains(targetNode)) {
        return;
      }
      if (isRewriteComposerOpen && onCloseRewriteComposer) {
        onCloseRewriteComposer();
        return;
      }
      onClearBlockTarget();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
    };
  }, [isInsertMode, isRewriteComposerOpen, onClearBlockTarget, onCloseRewriteComposer, selectedTarget]);

  useEffect(() => {
    if (isInsertMode || !isInlineInsertComposerOpen || !onCloseInsertComposer) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      const composerNode = document.querySelector('[data-insert-composer="true"]');
      if (composerNode?.contains(targetNode)) {
        return;
      }
      onCloseInsertComposer();
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
    };
  }, [isInlineInsertComposerOpen, isInsertMode, onCloseInsertComposer]);

  useEffect(() => {
    if (isInsertMode || !isInlineInsertComposerOpen || !onCloseInsertComposer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseInsertComposer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInlineInsertComposerOpen, isInsertMode, onCloseInsertComposer]);

  useEffect(() => {
    if (isInsertMode || !selectedTarget || !onClearBlockTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isRewriteComposerOpen && onCloseRewriteComposer) {
        onCloseRewriteComposer();
        return;
      }
      onClearBlockTarget();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInsertMode, isRewriteComposerOpen, onClearBlockTarget, onCloseRewriteComposer, selectedTarget]);

  const renderPreviewBlock = (block: ScriptBlock) => {
    const baseClasses = 'script-block script-export-chrome relative rounded border border-dashed border-indigo-400/60 bg-indigo-50/60 px-4 py-3 shadow-sm';
    if (block.type === BlockType.HEADING) {
      return (
        <div className={`${baseClasses} text-sm`}>
          <div className="script-scene-heading font-bold uppercase text-sm border-b border-indigo-200 pb-2">
            {block.text.toUpperCase()}
          </div>
        </div>
      );
    }

    let content = null;
    if (block.type === BlockType.ACTION) {
      content = <div className="script-block-action leading-relaxed">{block.text}</div>;
    } else if (block.type === BlockType.DIALOGUE) {
      content = (
        <div className="script-block-dialogue max-w-md mx-auto text-center">
          <div className="script-dialogue-character uppercase mt-2 mb-0 font-bold tracking-wider">
            {getDisplayCharacter(block.character)}
          </div>
          {block.parenthetical && (
            <div className="script-dialogue-parenthetical text-sm italic lowercase mb-0">
              {block.parenthetical}
            </div>
          )}
          <div className="script-dialogue-text mt-0 whitespace-pre-wrap">
            {block.text}
          </div>
        </div>
      );
    } else if (block.type === BlockType.TRANSITION) {
      content = (
        <div className="script-block-transition text-right uppercase font-bold pr-4">
          {block.text}
        </div>
      );
    }

    if (!content) return null;

    return (
      <div className={baseClasses}>
        {content}
      </div>
    );
  };

  const renderInsertTarget = useCallback(
    (
      target: { sceneId: string; blockId: string },
      label?: string
    ) => {
      const isSelected = insertTarget?.sceneId === target.sceneId && insertTarget?.blockId === target.blockId;
      const showActions = isSelected && Boolean(pendingInsertBlock) && (onConfirmInsertMode || onCancelInsertMode);
      return (
        <div className="script-export-chrome w-full">
          <button
            type="button"
            onClick={() => onSelectInsertTarget(target)}
            className={`group w-full flex items-center gap-3 py-2 text-left transition-colors ${
              isSelected ? 'text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-pressed={isSelected}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                isSelected
                  ? 'bg-indigo-500 text-white border-indigo-400'
                  : 'bg-white border-gray-300 text-gray-500 group-hover:border-indigo-400 group-hover:text-indigo-500'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </span>
            <span
              className={`h-px flex-1 transition-colors ${
                isSelected ? 'bg-indigo-400' : 'bg-gray-300/80 group-hover:bg-indigo-300'
              }`}
            />
            {(label || isSelected) && (
              <span className="text-[9px] uppercase tracking-widest text-gray-400">
                {label ?? 'Selected'}
              </span>
            )}
          </button>
          {showActions && (
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
              {onConfirmInsertMode && (
                <button
                  type="button"
                  onClick={onConfirmInsertMode}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                >
                  Insert Here
                </button>
              )}
              {onCancelInsertMode && (
                <button
                  type="button"
                  onClick={onCancelInsertMode}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest rounded-md border border-gray-300 text-gray-600 hover:text-gray-800 hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      );
    },
    [insertTarget, onCancelInsertMode, onConfirmInsertMode, onSelectInsertTarget, pendingInsertBlock]
  );
  const renderInlineInsertSlot = useCallback((insertIndex: number, anchor: ScriptAnchor | null) => {
    const isActive = activeInsertAnchor?.id === anchor?.id || activeInsertIndex === insertIndex;
    return (
      <div className="script-export-chrome relative h-10" data-insert-slot-wrapper="true">
        <button
          type="button"
          data-anchor-id={anchor?.id}
          data-testid={`insert-slot-${insertIndex}`}
          data-active={isActive ? 'true' : 'false'}
          aria-label={`Insert at slot ${insertIndex}`}
          aria-pressed={isActive}
          onClick={(event) => {
            event.stopPropagation();
            if (!anchor) return;
            onRequestInsert?.(anchor);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            if (!anchor) return;
            onRequestInsert?.(anchor);
          }}
          className={`group/slot absolute inset-x-1 top-1/2 h-10 -translate-y-1/2 rounded-full transition-[opacity,transform,filter] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f1e7] ${
            isActive ? 'opacity-100' : 'opacity-0 hover:opacity-100 hover:scale-[1.01] focus-visible:scale-[1.01] focus-visible:opacity-100'
          }`}
        >
          <span
            className={`pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-200 ${
              isActive ? 'bg-indigo-500/90' : 'bg-blue-300/75 group-hover/slot:bg-blue-500/80'
            }`}
          />
          <span
            className={`pointer-events-none absolute left-1/2 top-1/2 inline-flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-blue-200/70 bg-[#f6f1e7] text-blue-700 shadow-[0_3px_8px_rgba(15,23,42,0.16)] transition-[opacity,transform,box-shadow] duration-200 ${
              isActive
                ? 'scale-100 opacity-100 shadow-[0_4px_12px_rgba(79,70,229,0.28)]'
                : 'scale-90 opacity-0 group-hover/slot:scale-100 group-hover/slot:opacity-100 group-hover/slot:shadow-[0_4px_12px_rgba(59,130,246,0.22)] group-focus-visible/slot:scale-100 group-focus-visible/slot:opacity-100'
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    );
  }, [activeInsertAnchor, activeInsertIndex, onRequestInsert]);

  const renderedScenes = scenes.length === 0 ? null : scenes.map((scene, sceneIndex) => {
      const blocks = scene.blocks;
      const isFirstScene = sceneIndex === 0;
      const isLastScene = sceneIndex === scenes.length - 1;
      const isSelectedHeading = selectedTarget?.kind === 'scene-heading' && selectedTarget.sceneId === scene.id;

      return (
        <div key={scene.id} id={`scene-${scene.id}`} className="script-scene mb-8">
          <div
            id={`scene-heading-${scene.id}`}
            className={`script-scene-heading mb-4 rounded-lg border px-4 py-3 font-extrabold uppercase tracking-[0.03em] text-[17px] transition-[background-color,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f1e7] ${
              isSelectedHeading && !activeInsertAnchor
                ? 'border-slate-400 bg-slate-900/[0.08] shadow-[0_7px_18px_rgba(15,23,42,0.08)] focus-visible:border-blue-300 focus-visible:bg-blue-50/45 focus-visible:ring-1 focus-visible:ring-blue-300/70 focus-visible:shadow-[0_6px_16px_rgba(37,99,235,0.08)]'
                : 'border-gray-300 hover:border-blue-300 hover:shadow-[0_6px_16px_rgba(37,99,235,0.08)] focus-visible:border-blue-300 focus-visible:bg-blue-50/45 focus-visible:ring-1 focus-visible:ring-blue-300/70 focus-visible:shadow-[0_6px_16px_rgba(37,99,235,0.08)]'
            }`}
            role="button"
            tabIndex={0}
            aria-pressed={isSelectedHeading}
            onClick={() => onSelectSceneHeading?.(scene.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onSelectSceneHeading?.(scene.id);
            }}
          >
            {scene.heading}
          </div>

          <div className="space-y-4">
            {isInsertMode && isFirstScene && renderInsertTarget({ sceneId: scene.id, blockId: INSERT_TOP_ID }, 'Insert at top')}
            {isInsertMode && isFirstScene && hasPendingPreview && insertTarget?.sceneId === scene.id && insertTarget?.blockId === INSERT_TOP_ID && pendingInsertBlock && (
              renderPreviewBlock(pendingInsertBlock)
            )}

            {blocks.map((block, index) => {
              const isInsertTarget = insertTarget?.blockId === block.id;
              const isRewriteTarget = rewriteTarget?.sceneId === scene.id && rewriteTarget?.blockId === block.id;
              const isSelectedBlock = selectedTarget?.kind === 'block' && selectedTarget.sceneId === scene.id && selectedBlockId === block.id;
              const isError = blockStatuses[block.id] === 'error';
              const blockWrapperClasses = `group relative rounded-md border transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f1e7] ${
                isInsertTarget ? 'border-indigo-500/50 bg-indigo-100/30 ring-1 ring-indigo-500/50' : 'border-transparent'
              } ${
                isRewriteTarget ? 'border-sky-400/60 ring-2 ring-sky-400/60 bg-sky-100/40' : ''
              } ${
                isSelectedBlock && !activeInsertAnchor
                  ? 'border-slate-400 bg-slate-900/[0.08] shadow-[0_7px_18px_rgba(15,23,42,0.08)] focus-visible:border-blue-300 focus-visible:bg-blue-50/45 focus-visible:ring-1 focus-visible:ring-blue-300/70 focus-visible:shadow-[0_6px_16px_rgba(37,99,235,0.08)]'
                  : ''
              } ${
                !isInsertMode ? 'cursor-pointer hover:border-blue-300 hover:shadow-[0_6px_16px_rgba(37,99,235,0.08)]' : ''
              }`;
              const blockStatusClasses = isError ? ERROR_CLASSES : '';
              const isLastBlock = index === blocks.length - 1;
              const showBottomLabel = isLastScene && isLastBlock;
              const globalBlockOrder = blockOrderIndexById.get(block.id);
              const nextInsertIndex = typeof globalBlockOrder === 'number' ? globalBlockOrder + 1 : null;
              const nextInsertAnchor = typeof nextInsertIndex === 'number'
                ? createAfterBlockAnchor(block.id)
                : null;

              let content = null;

              if (block.type === BlockType.ACTION) {
                content = (
                  <div className="script-block-action mb-4 leading-relaxed">
                    {block.text}
                  </div>
                );
              } else if (block.type === BlockType.DIALOGUE) {
                content = (
                  <div className="script-block-dialogue max-w-md mx-auto text-center">
                    <div className="script-dialogue-character uppercase mt-4 mb-0 font-bold tracking-wider">
                      {getDisplayCharacter(block.character)}
                    </div>
                    {block.parenthetical && (
                      <div className="script-dialogue-parenthetical text-sm italic lowercase mb-0">{block.parenthetical}</div>
                    )}
                    <div className="script-dialogue-text mt-0 mb-4 whitespace-pre-wrap">
                      {block.text}
                    </div>
                  </div>
                );
              } else if (block.type === BlockType.TRANSITION) {
                content = (
                  <div className="script-block-transition text-right uppercase font-bold pr-4">
                    {block.text}
                  </div>
                );
              }

              if (!content) return null;

              return (
                <React.Fragment key={block.id}>
                  <div
                    id={`block-${block.id}`}
                    className={`${blockWrapperClasses} ${blockStatusClasses} script-block`}
                    data-block-type={block.type}
                    onClick={() => {
                      if (isInsertMode) return;
                      const target = { sceneId: scene.id, blockId: block.id };
                      onSelectBlockTarget?.(target);
                      if (isRewriteMode && onSelectRewriteTarget) {
                        onSelectRewriteTarget(target);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isInsertMode) return;
                      if (event.key === 'Escape' && isSelectedBlock) {
                        event.preventDefault();
                        onClearBlockTarget?.();
                        return;
                      }
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      const target = { sceneId: scene.id, blockId: block.id };
                      onSelectBlockTarget?.(target);
                      if (isRewriteMode && onSelectRewriteTarget) {
                        onSelectRewriteTarget(target);
                      }
                    }}
                    role={!isInsertMode ? 'button' : undefined}
                    tabIndex={!isInsertMode ? 0 : undefined}
                    aria-pressed={!isInsertMode ? isSelectedBlock : undefined}
                  >
                    {isError && (
                      <span className="script-export-chrome absolute left-2 top-2 text-[9px] uppercase tracking-widest text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full">
                        Audio error
                      </span>
                    )}
                    {!isInsertMode && (
                      <div
                        className={`script-export-chrome absolute right-0 top-1 transition-opacity duration-150 ease-out ${
                          block.locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleLock(scene.id, block.id);
                          }}
                          className={`p-1.5 rounded-full border bg-white shadow-sm transition-[color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
                            block.locked
                              ? 'border-indigo-300 text-indigo-700 hover:text-indigo-800'
                              : 'border-gray-200 text-gray-500 hover:text-indigo-600'
                          }`}
                          title={block.locked ? 'Unlock block' : 'Lock block'}
                          aria-label={block.locked ? 'Unlock block' : 'Lock block'}
                        >
                          {block.locked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {content}
                  </div>

                  {isInsertMode && renderInsertTarget(
                    { sceneId: scene.id, blockId: block.id },
                    showBottomLabel ? 'Insert at bottom' : undefined
                  )}
                  {!isInsertMode && typeof nextInsertIndex === 'number' && renderInlineInsertSlot(nextInsertIndex, nextInsertAnchor)}
                  {isInsertMode && hasPendingPreview && insertTarget?.sceneId === scene.id && insertTarget?.blockId === block.id && pendingInsertBlock && (
                    renderPreviewBlock(pendingInsertBlock)
                  )}
                </React.Fragment>
              );
            })}

            {!isInsertMode && blocks.length === 0 && renderInlineInsertSlot(
              sceneStartIndexById.get(scene.id) ?? 0,
              createSceneTopAnchor(scene.id)
            )}
            {isInsertMode && blocks.length === 0 && isLastScene && renderInsertTarget({ sceneId: scene.id, blockId: INSERT_BOTTOM_ID }, 'Insert at bottom')}
            {isInsertMode && blocks.length === 0 && isLastScene && hasPendingPreview && insertTarget?.sceneId === scene.id && insertTarget?.blockId === INSERT_BOTTOM_ID && pendingInsertBlock && (
              renderPreviewBlock(pendingInsertBlock)
            )}
          </div>
        </div>
      );
    });

  if (scenes.length === 0) return null;
  const selectedScene = selectedTarget
    ? scenes.find((scene) => scene.id === selectedTarget.sceneId) ?? null
    : null;
  const selectedBlock = selectedTarget?.kind === 'block'
    ? selectedScene?.blocks.find((block) => block.id === selectedTarget.blockId) ?? null
    : null;
  const selectedBlockRewriteDisabled = Boolean(selectedBlock?.locked) || !onRewriteBlock;
  const selectedBlockDeleteDisabled = !onDeleteBlock;

  const containerClasses = `font-screenplay script-export-root bg-[#f6f1e7] text-black p-4 md:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-[#d6cdbd] w-full max-w-[1120px] mx-auto rounded-md relative ${
    scrollable ? 'h-full min-h-0 overflow-hidden' : 'min-h-[600px] overflow-visible'
  } ${className}`.trim();
  const contentClasses = scrollable
    ? 'script-export-content relative z-10 h-full overflow-y-auto pr-3 pt-2 pb-12 space-y-8'
    : 'script-export-content relative z-10 space-y-6';

  return (
    <div
      ref={setRootElement}
      className={containerClasses}
      data-script-export-root="true"
    >
      <div className="script-export-texture absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03] bg-repeat bg-[url('/textures/cream-paper.svg')]" />
      <div
        className={contentClasses}
        data-script-scroll="true"
        tabIndex={-1}
      >
        {renderedScenes}
      </div>
      {!isInsertMode && !activeInsertAnchor && selectedTarget && selectedAnchorElement && (
        <AnchoredPopover
          open
          anchor={selectedAnchorElement}
          className="script-export-chrome"
          preferredPlacement="bottom"
          topBoundary={rootElement}
        >
          <div
            data-selected-actions="true"
            data-testid={selectedTarget.kind === 'block' ? `selected-block-actions-${selectedTarget.blockId}` : `selected-heading-actions-${selectedTarget.sceneId}`}
            className="flex items-center gap-1.5 rounded-full border border-[#d6cdbd] bg-[#f6f1e7] px-2 py-1.5 shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
          >
            {selectedTarget.kind === 'block' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedScene || !selectedBlock || selectedBlockRewriteDisabled) return;
                    onRewriteBlock?.({ sceneId: selectedScene.id, blockId: selectedBlock.id });
                  }}
                  disabled={selectedBlockRewriteDisabled}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700 transition-colors hover:bg-indigo-100 disabled:text-gray-400"
                  aria-label="Rewrite selected block"
                >
                  Rewrite
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInsertFromSelection?.(selectedTarget)}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100"
                  aria-label="Insert near selected block"
                >
                  Insert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedScene || !selectedBlock || selectedBlockDeleteDisabled) return;
                    onDeleteBlock?.({ sceneId: selectedScene.id, blockId: selectedBlock.id });
                  }}
                  disabled={selectedBlockDeleteDisabled}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700 transition-colors hover:bg-red-100 disabled:text-gray-400"
                  aria-label="Delete selected block"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedScene) return;
                    onEditSceneHeading?.(selectedScene.id, selectedScene.heading);
                  }}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700 transition-colors hover:bg-indigo-100"
                  aria-label="Edit selected scene heading"
                >
                  Edit Heading
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInsertFromSelection?.(selectedTarget)}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100"
                  aria-label="Insert after scene heading"
                >
                  Insert After
                </button>
              </>
            )}
          </div>
        </AnchoredPopover>
      )}
      {!isInsertMode && Boolean(insertComposer && insertAnchorElement) && (
        <AnchoredPopover
          open
          anchor={insertAnchorElement}
          className="script-export-chrome"
          preferredPlacement="bottom"
          topBoundary={rootElement}
        >
          {insertComposer}
        </AnchoredPopover>
      )}
      {!isInsertMode && Boolean(rewriteComposer && rewriteAnchorElement) && (
        <AnchoredPopover
          open
          anchor={rewriteAnchorElement}
          className="script-export-chrome"
          preferredPlacement="bottom"
          topBoundary={rootElement}
        >
          {rewriteComposer}
        </AnchoredPopover>
      )}
      {!isInsertMode && Boolean(headingEditor && headingEditorAnchorElement) && (
        <AnchoredPopover
          open
          anchor={headingEditorAnchorElement}
          className="script-export-chrome"
          preferredPlacement="bottom"
          topBoundary={rootElement}
        >
          {headingEditor}
        </AnchoredPopover>
      )}
    </div>
  );
};
