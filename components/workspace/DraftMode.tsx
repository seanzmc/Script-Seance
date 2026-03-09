import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { List } from 'lucide-react';
import { ScriptPane, ScriptPaneProps } from '../ScriptPane';
import { DraftOutlinePanel } from './DraftOutlinePanel';

export type DraftModeProps = ScriptPaneProps;

const findSceneIdForBlock = (
  scenes: DraftModeProps['context'] extends infer T
    ? T extends { scenes: infer S }
      ? S extends Array<infer U>
        ? U[]
        : never
      : never
    : never,
  blockId: string | null
) => {
  if (!blockId) return null;
  const scene = scenes.find((entry) => entry.blocks.some((block) => block.id === blockId));
  return scene?.id ?? null;
};

export const DraftMode: React.FC<DraftModeProps> = (props) => {
  const { context, currentBlockId, insertScrollTargetId } = props;
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [lastNavigatedSceneId, setLastNavigatedSceneId] = useState<string | null>(null);
  const scenes = context?.scenes ?? [];
  const sceneIds = useMemo(() => scenes.map((scene) => scene.id), [scenes]);
  const currentBlockSceneId = useMemo(
    () => findSceneIdForBlock(scenes, currentBlockId),
    [currentBlockId, scenes]
  );
  const insertTargetSceneId = useMemo(
    () => findSceneIdForBlock(scenes, insertScrollTargetId),
    [insertScrollTargetId, scenes]
  );
  const activeSceneId = currentBlockSceneId ?? insertTargetSceneId ?? lastNavigatedSceneId ?? sceneIds[0] ?? null;

  useEffect(() => {
    if (!lastNavigatedSceneId) return;
    if (sceneIds.includes(lastNavigatedSceneId)) return;
    setLastNavigatedSceneId(sceneIds[0] ?? null);
  }, [lastNavigatedSceneId, sceneIds]);

  const handleSelectScene = useCallback((sceneId: string) => {
    setLastNavigatedSceneId(sceneId);
    setIsOutlineOpen(false);

    const target = document.getElementById(`scene-heading-${sceneId}`) ?? document.getElementById(`scene-${sceneId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const scrollContainer = document.querySelector('[data-script-scroll="true"]');
    if (scrollContainer instanceof HTMLElement) {
      scrollContainer.focus({ preventScroll: true });
    }
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#17181c]">
      <div className="mx-auto flex w-full max-w-[1360px] flex-1 min-h-0 gap-4 px-4 py-4 sm:px-5 lg:px-6">
        <aside className="hidden w-[18rem] shrink-0 lg:block">
          <div className="h-full overflow-y-auto pr-1">
            <DraftOutlinePanel
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelectScene={handleSelectScene}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {context && (
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setIsOutlineOpen(true)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/45 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-200 transition-colors hover:bg-gray-900"
              >
                <List className="h-4 w-4" />
                Scene Outline
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.5rem] border border-gray-900/60 bg-black/10">
            <ScriptPane {...props} />
          </div>
        </div>
      </div>

      {context && isOutlineOpen && (
        <>
          <div
            className="fixed inset-0 z-[125] bg-black/55 backdrop-blur-[2px] lg:hidden"
            aria-hidden="true"
            onClick={() => setIsOutlineOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[126] w-full max-w-[22rem] border-r border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.94))] p-4 shadow-[24px_0_48px_rgba(0,0,0,0.42)] lg:hidden">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Draft Navigation</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Scene Outline</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOutlineOpen(false)}
                className="rounded-full border border-gray-700 bg-gray-900/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-200 transition-colors hover:bg-gray-800"
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-4.25rem)] overflow-y-auto">
              <DraftOutlinePanel
                scenes={scenes}
                activeSceneId={activeSceneId}
                onSelectScene={handleSelectScene}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
};
