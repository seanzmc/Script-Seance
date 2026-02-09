import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Scene, BlockType, ScriptBlock, INSERT_TOP_ID, INSERT_BOTTOM_ID } from '../types';
import { Lock, Unlock, PlusCircle } from 'lucide-react';

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
}

const ACTIVE_CLASSES = 'ring-2 ring-yellow-400/40 bg-yellow-100/70';
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
  insertScrollToken
}) => {
  const insertHighlightTimeoutRef = useRef<number | null>(null);
  const playableBlockIds = useMemo(() => {
    const ids: string[] = [];
    scenes.forEach(scene => {
      scene.blocks.forEach(block => {
        if (block.type !== BlockType.HEADING) {
          ids.push(block.id);
        }
      });
    });
    return ids;
  }, [scenes]);
  const activeBlockId =
    currentBlockIndex >= 0 && currentBlockIndex < playableBlockIds.length
      ? playableBlockIds[currentBlockIndex]
      : currentBlockId;
  const isInsertMode = insertModeActive;
  const isRewriteMode = rewriteModeActive && !isInsertMode;
  const hasPendingPreview = Boolean(pendingInsertBlock && insertTarget);
  const getDisplayCharacter = useCallback((name?: string) => {
    if (!name) return '';
    const normalized = normalizeCharacterName(name);
    const matched = characters.find(char => normalizeCharacterName(char) === normalized);
    return matched ?? name;
  }, [characters]);

  useEffect(() => {
    if (autoScroll && activeBlockId) {
      const el = document.getElementById(`block-${activeBlockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const isSceneTarget = insertScrollTargetId.startsWith('scene:');
    const targetId = isSceneTarget
      ? insertScrollTargetId.slice('scene:'.length)
      : insertScrollTargetId;
    const el = document.getElementById(
      isSceneTarget ? `scene-${targetId}` : `block-${targetId}`
    );
    requestAnimationFrame(() => {
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: isSceneTarget ? 'start' : 'center'
        });
        if (isSceneTarget) {
          return;
        }
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

  const renderedScenes = scenes.length === 0 ? null : scenes.map((scene, sceneIndex) => {
      const blocks = scene.blocks.filter(block => block.type !== BlockType.HEADING);
      const isFirstScene = sceneIndex === 0;
      const isLastScene = sceneIndex === scenes.length - 1;

      return (
        <div key={scene.id} id={`scene-${scene.id}`} className="script-scene mb-8">
          <div className="script-scene-heading font-bold uppercase mb-4 text-lg border-b border-gray-300 pb-2">
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
              const isError = blockStatuses[block.id] === 'error';
              const blockWrapperClasses = `group relative rounded transition-colors ${
                isInsertTarget ? 'ring-1 ring-indigo-500/50 bg-indigo-100/30' : ''
              } ${
                isRewriteTarget ? 'ring-2 ring-sky-400/60 bg-sky-100/40' : ''
              } ${
                isRewriteMode ? 'cursor-pointer hover:bg-sky-100/20' : ''
              }`;
              const blockStatusClasses = isError ? ERROR_CLASSES : '';
              const isLastBlock = index === blocks.length - 1;
              const showBottomLabel = isLastScene && isLastBlock;

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
                      if (!isRewriteMode || !onSelectRewriteTarget) return;
                      onSelectRewriteTarget({ sceneId: scene.id, blockId: block.id });
                    }}
                    onKeyDown={(event) => {
                      if (!isRewriteMode || !onSelectRewriteTarget) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelectRewriteTarget({ sceneId: scene.id, blockId: block.id });
                    }}
                    role={isRewriteMode ? 'button' : undefined}
                    tabIndex={isRewriteMode ? 0 : undefined}
                    aria-pressed={isRewriteMode ? isRewriteTarget : undefined}
                  >
                    {isError && (
                      <span className="script-export-chrome absolute left-2 top-2 text-[9px] uppercase tracking-widest text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full">
                        Audio error
                      </span>
                    )}
                    {!isInsertMode && (
                      <div
                        className={`script-export-chrome absolute right-0 top-1 transition-opacity ${
                          block.locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleLock(scene.id, block.id);
                          }}
                          className={`p-1.5 bg-white border rounded-full shadow-sm hover:shadow transition-all ${
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
                  {isInsertMode && hasPendingPreview && insertTarget?.sceneId === scene.id && insertTarget?.blockId === block.id && pendingInsertBlock && (
                    renderPreviewBlock(pendingInsertBlock)
                  )}
                </React.Fragment>
              );
            })}

            {isInsertMode && blocks.length === 0 && isLastScene && renderInsertTarget({ sceneId: scene.id, blockId: INSERT_BOTTOM_ID }, 'Insert at bottom')}
            {isInsertMode && blocks.length === 0 && isLastScene && hasPendingPreview && insertTarget?.sceneId === scene.id && insertTarget?.blockId === INSERT_BOTTOM_ID && pendingInsertBlock && (
              renderPreviewBlock(pendingInsertBlock)
            )}
          </div>
        </div>
      );
    });

  if (scenes.length === 0) return null;

  const containerClasses = `font-screenplay script-export-root bg-[#f6f1e7] text-black p-4 md:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-[#d6cdbd] w-full max-w-[1120px] mx-auto rounded-md relative ${
    scrollable ? 'h-full min-h-0 overflow-hidden' : 'min-h-[600px] overflow-visible'
  } ${className}`.trim();
  const contentClasses = scrollable
    ? 'script-export-content relative z-10 h-full overflow-y-auto pr-3 space-y-6'
    : 'script-export-content relative z-10 space-y-6';

  return (
    <div
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
    </div>
  );
};
