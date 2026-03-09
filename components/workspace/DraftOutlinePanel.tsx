import React from 'react';
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
}) => (
  <div className={className}>
    <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Scene Outline</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Navigate the draft</h2>
      </div>
      {scenes.length === 0 ? (
        <p className="text-sm text-gray-400">Scenes will appear here once the script has content.</p>
      ) : (
        <nav aria-label="Scene outline" className="space-y-2">
          {scenes.map((scene, index) => {
            const isActive = scene.id === activeSceneId;
            const hasSummary = scene.summary.trim().length > 0;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
                data-testid={`draft-outline-item-${scene.id}`}
                aria-pressed={isActive}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-indigo-300/60 bg-indigo-500/15 text-white'
                    : 'border-gray-800 bg-gray-900/45 text-gray-200 hover:border-gray-700 hover:bg-gray-900/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-200/80">
                      Scene {index + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold uppercase tracking-[0.06em]">
                      {scene.heading}
                    </p>
                    {hasSummary && (
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-400">
                        {scene.summary}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  </div>
);
