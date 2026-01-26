import React, { useEffect, useMemo, useState } from 'react';
import { Scene, BlockType } from '../types';
import { MoreVertical, RefreshCw, Lock, Unlock, PlusCircle } from 'lucide-react';

interface ScriptDisplayProps {
  scenes: Scene[];
  currentBlockId: string | null;
  currentBlockIndex: number;
  blockStatuses: Record<string, 'notGenerated' | 'generating' | 'ready' | 'error'>;
  showHighlights: boolean;
  autoScroll: boolean;
  onRegenerate: (sceneId: string, blockId: string) => void;
  onToggleLock: (sceneId: string, blockId: string) => void;
  onSelectInsertTarget: (target: { sceneId: string; blockId: string }) => void;
  onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void;
  characters: string[];
  insertTarget?: { sceneId: string; blockId: string } | null;
  isRegenerating: boolean;
  className?: string;
  scrollable?: boolean;
}

const ACTIVE_CLASSES = 'ring-2 ring-yellow-400/40 bg-yellow-100/70';
const ERROR_CLASSES = 'border border-red-300/70 bg-red-50/60';

export const ScriptDisplay: React.FC<ScriptDisplayProps> = ({
  scenes,
  currentBlockId,
  currentBlockIndex,
  blockStatuses,
  showHighlights,
  autoScroll,
  onRegenerate,
  onToggleLock,
  onSelectInsertTarget,
  onChangeSpeaker,
  characters,
  insertTarget,
  isRegenerating,
  className = '',
  scrollable = false
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const speakerOptions = useMemo(
    () => ['Narrator', ...characters.filter(char => char !== 'Narrator')],
    [characters]
  );
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
    if (!openMenuId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const menuRoot = target.closest(`[data-menu-root="${openMenuId}"]`);
      if (!menuRoot) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

  const renderedScenes = useMemo(() => {
    if (scenes.length === 0) return null;

    return scenes.map((scene) => (
      <div key={scene.id} id={`scene-${scene.id}`} className="mb-8">
        <div className="font-bold uppercase mb-4 text-lg border-b border-gray-300 pb-2">
          {scene.heading}
        </div>

        <div className="space-y-4">
          {scene.blocks.map((block) => {
            if (block.type === BlockType.HEADING) {
              return null;
            }

            const isInsertTarget = insertTarget?.blockId === block.id;
            const isError = blockStatuses[block.id] === 'error';
            const blockWrapperClasses = `group relative rounded transition-colors ${
              isInsertTarget ? 'ring-1 ring-indigo-500/50 bg-indigo-100/30' : ''
            }`;
            const blockStatusClasses = isError ? ERROR_CLASSES : '';

            let content = null;

            if (block.type === BlockType.ACTION) {
              content = (
                <div className="mb-4 leading-relaxed">
                  {block.text}
                </div>
              );
            } else if (block.type === BlockType.DIALOGUE) {
              content = (
                <div className="max-w-md mx-auto text-center">
                  <div className="uppercase mt-4 mb-0 font-bold tracking-wider">{block.character}</div>
                  {block.parenthetical && (
                    <div className="text-sm italic lowercase mb-0">{block.parenthetical}</div>
                  )}
                  <div className="mt-0 mb-4 whitespace-pre-wrap">
                    {block.text}
                  </div>
                </div>
              );
            } else if (block.type === BlockType.TRANSITION) {
              content = (
                <div className="text-right uppercase font-bold pr-4">
                  {block.text}
                </div>
              );
            }

            if (!content) return null;

            return (
              <div
                key={block.id}
                id={`block-${block.id}`}
                className={`${blockWrapperClasses} ${blockStatusClasses}`}
              >
                {isError && (
                  <span className="absolute left-2 top-2 text-[9px] uppercase tracking-widest text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full">
                    Audio error
                  </span>
                )}
                <div className="absolute right-0 top-1 flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="relative" data-menu-root={block.id}>
                    <button
                      onClick={() => setOpenMenuId(openMenuId === block.id ? null : block.id)}
                      className="p-1.5 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-indigo-600 shadow-sm hover:shadow transition-all"
                      title="Block actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {openMenuId === block.id && (
                      <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-lg shadow-xl p-2 text-sm text-gray-700 z-20">
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            onSelectInsertTarget({ sceneId: scene.id, blockId: block.id });
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 text-left"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Insert block after
                        </button>
                        {!block.locked && (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onRegenerate(scene.id, block.id);
                            }}
                            disabled={isRegenerating}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 text-left disabled:opacity-60"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                            Regenerate block
                          </button>
                        )}
                        {block.type === BlockType.DIALOGUE && (
                          <div className="px-2 py-2 space-y-1">
                            <label className="text-[10px] uppercase tracking-widest text-gray-400">Speaker</label>
                            <select
                              value={block.character || 'Narrator'}
                              onChange={(e) => {
                                onChangeSpeaker(scene.id, block.id, e.target.value);
                                setOpenMenuId(null);
                              }}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                            >
                              {speakerOptions.map(char => (
                                <option key={char} value={char}>
                                  {char}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            onToggleLock(scene.id, block.id);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 text-left"
                        >
                          {block.locked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                          {block.locked ? 'Unlock block' : 'Lock block'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    ));
  }, [blockStatuses, insertTarget, isRegenerating, onChangeSpeaker, onRegenerate, onSelectInsertTarget, onToggleLock, openMenuId, scenes, speakerOptions]);

  if (scenes.length === 0) return null;

  const containerClasses = `font-screenplay bg-[#f6f1e7] text-black p-8 md:p-16 shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-[#d6cdbd] max-w-4xl mx-auto rounded-md relative ${
    scrollable ? 'h-full min-h-0 overflow-hidden' : 'min-h-[600px] overflow-visible'
  } ${className}`.trim();
  const contentClasses = scrollable
    ? 'relative z-10 h-full overflow-y-auto space-y-6'
    : 'relative z-10 space-y-6';

  return (
    <div
      className={containerClasses}
    >
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03] bg-repeat bg-[url('/textures/cream-paper.svg')]" />
      <div className={contentClasses}>
        {renderedScenes}
      </div>
    </div>
  );
};
