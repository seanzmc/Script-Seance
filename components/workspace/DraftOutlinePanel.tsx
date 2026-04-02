import React, { useState } from 'react';
import type { Scene } from '../../types';

export interface DraftOutlinePanelProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  className?: string;
}

export const DraftOutlinePanel: React.FC<DraftOutlinePanelProps> = ({
  scenes,
  activeSceneId,
  onSelectScene,
  className
}) => {
  const [expandedSceneIds, setExpandedSceneIds] = useState<string[]>([]);

  const toggleExpanded = (sceneId: string) => {
    setExpandedSceneIds((current) => (
      current.includes(sceneId)
        ? current.filter((id) => id !== sceneId)
        : [...current, sceneId]
    ));
  };

  return (
    <div className={className}>
      {scenes.length === 0 ? (
        <p className="rounded-xl border border-gray-800 bg-gray-950/30 px-3 py-3 text-sm text-gray-400">
          No scenes yet.
        </p>
      ) : (
        <nav aria-label="Scene outline" className="space-y-1.5">
          {scenes.map((scene, index) => {
            const isActive = scene.id === activeSceneId;
            const summary = scene.summary.trim();
            const hasSummary = summary.length > 0;
            const isExpanded = isActive || expandedSceneIds.includes(scene.id);
            const shouldShowToggle = summary.length > 140;

            return (
              <div
                key={scene.id}
                className={`rounded-xl border transition-colors ${
                  isActive
                    ? 'border-indigo-300/60 bg-indigo-500/12'
                    : 'border-gray-800/80 bg-gray-950/25 hover:border-gray-700 hover:bg-gray-950/45'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectScene(scene.id)}
                  data-testid={`draft-outline-item-${scene.id}`}
                  aria-pressed={isActive}
                  className="w-full px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-200/75">
                        Scene {index + 1}
                      </p>
                    </div>
                    <p className={`mt-1 text-[13px] font-semibold uppercase tracking-[0.05em] ${
                      isActive ? 'text-white' : 'text-gray-100'
                    }`}>
                      {scene.heading}
                    </p>
                    {hasSummary ? (
                      <div className="mt-1.5">
                        <p className={`text-xs leading-relaxed ${
                          isActive ? 'text-gray-100/90' : 'text-gray-400'
                        } ${isExpanded ? '' : 'line-clamp-5'}`}>
                          {summary}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs italic leading-relaxed text-gray-500">
                        No summary available yet.
                      </p>
                    )}
                  </div>
                </button>
                {hasSummary && shouldShowToggle ? (
                  <div className="px-3 pb-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(scene.id)}
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-300 transition-colors hover:text-indigo-200"
                    >
                      {isExpanded ? 'Less' : 'More'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
};
