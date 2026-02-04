import React from 'react';
import { X } from 'lucide-react';

export type ToolKey = 'generate' | 'insert' | 'rewrite' | 'voices' | 'playback' | 'export';

const TOOL_GROUPS: { key: ToolKey; label: string }[][] = [
  [
    { key: 'generate', label: 'Generate' },
    { key: 'insert', label: 'Insert' },
    { key: 'rewrite', label: 'Rewrite' }
  ],
  [
    { key: 'voices', label: 'Voices' },
    { key: 'playback', label: 'Playback' }
  ],
  [
    { key: 'export', label: 'Export' }
  ]
];

const TOOL_PLACEHOLDERS: Record<ToolKey, string> = {
  generate: 'Generate panel (coming soon).',
  insert: 'Insert panel (coming soon).',
  rewrite: 'Rewrite panel (coming soon).',
  voices: 'Voices panel (coming soon).',
  playback: 'Playback panel (coming soon).',
  export: 'Export panel (coming soon).'
};

export interface BottomToolbeltProps {
  activeTool: ToolKey | null;
  onSelectTool: (tool: ToolKey) => void;
  onCloseTool: () => void;
}

export const BottomToolbelt: React.FC<BottomToolbeltProps> = ({
  activeTool,
  onSelectTool,
  onCloseTool
}) => {
  const activePlaceholder = activeTool ? TOOL_PLACEHOLDERS[activeTool] : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 px-4">
      {activeTool && (
        <div className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-800 bg-gray-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-200">{activePlaceholder}</span>
            <button
              type="button"
              onClick={onCloseTool}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Close tool panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-800 bg-gray-950/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-gray-400">
          {TOOL_GROUPS.map((group, groupIndex) => (
            <React.Fragment key={`tool-group-${groupIndex}`}>
              <div className="flex flex-wrap items-center gap-2">
                {group.map((tool) => {
                  const isActive = activeTool === tool.key;
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() => onSelectTool(tool.key)}
                      aria-pressed={isActive}
                      className={`rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-[0.3em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
                        isActive
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-400 hover:bg-gray-800/80 hover:text-white'
                      }`}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>
              {groupIndex < TOOL_GROUPS.length - 1 && (
                <span className="text-gray-600">|</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
