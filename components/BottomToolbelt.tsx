import React, { useEffect } from 'react';
import { Download, FileDown, X } from 'lucide-react';
import { Button } from './Button';

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

const TOOL_LABELS: Record<ToolKey, string> = {
  generate: 'Generate',
  insert: 'Insert',
  rewrite: 'Rewrite',
  voices: 'Voices',
  playback: 'Playback',
  export: 'Export'
};

export interface BottomToolbeltProps {
  activeTool: ToolKey | null;
  onSelectTool: (tool: ToolKey) => void;
  onCloseTool: () => void;
  onExportTxt?: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  playbackContent?: React.ReactNode;
  voicesContent?: React.ReactNode;
  insertContent?: React.ReactNode;
}

export const BottomToolbelt: React.FC<BottomToolbeltProps> = ({
  activeTool,
  onSelectTool,
  onCloseTool,
  onExportTxt,
  onExportPdf,
  exportDisabled = false,
  playbackContent,
  voicesContent,
  insertContent
}) => {
  const activePlaceholder = activeTool ? TOOL_PLACEHOLDERS[activeTool] : null;
  const activeLabel = activeTool ? TOOL_LABELS[activeTool] : null;
  const hasExportPanel = activeTool === 'export';
  const hasPlaybackPanel = activeTool === 'playback' && Boolean(playbackContent);
  const hasVoicesPanel = activeTool === 'voices' && Boolean(voicesContent);
  const hasInsertPanel = activeTool === 'insert' && Boolean(insertContent);
  const hasActivePanel = Boolean(activeTool);
  const panelDescription = hasExportPanel
    ? 'Download your script in common formats.'
    : hasPlaybackPanel
      ? 'Control playback and audio readiness.'
      : hasVoicesPanel
        ? 'Assign and preview voices for each character.'
        : hasInsertPanel
          ? 'Insert new blocks at a specific point in the script.'
          : null;

  useEffect(() => {
    if (!hasActivePanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseTool();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasActivePanel, onCloseTool]);

  return (
    <div className="w-full shrink-0 px-4 pb-4">
      <div className={`mx-auto w-full max-w-6xl flex flex-col ${hasActivePanel ? 'gap-2' : ''}`}>
        {hasActivePanel && (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex flex-col min-h-[260px] max-h-[360px]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3 shrink-0">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.4em] text-gray-500">{activeLabel}</p>
                {panelDescription ? (
                  <p className="text-xs text-gray-400">{panelDescription}</p>
                ) : (
                  <p className="text-sm text-gray-200">{activePlaceholder}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onCloseTool}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label="Close tool panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {hasExportPanel && (
              <div className="px-4 py-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onExportTxt}
                    disabled={exportDisabled || !onExportTxt}
                    className="w-full text-xs"
                    title="Export script as a .txt file"
                  >
                    <Download className="w-3 h-3 mr-2" /> Export Script (.txt)
                  </Button>
                  {onExportPdf && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onExportPdf}
                      disabled={exportDisabled}
                      className="w-full text-xs"
                      title="Export script as a PDF via print dialog"
                    >
                      <FileDown className="w-3 h-3 mr-2" /> Export PDF
                    </Button>
                  )}
                </div>
              </div>
            )}
            {hasPlaybackPanel && (
              <div className="px-4 py-4 flex-1 overflow-y-auto">
                {playbackContent}
              </div>
            )}
            {hasVoicesPanel && (
              <div className="px-4 py-4 flex-1 overflow-y-auto">
                {voicesContent}
              </div>
            )}
            {hasInsertPanel && (
              <div className="px-4 py-4 flex-1">
                {insertContent}
              </div>
            )}
          </div>
        )}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
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
    </div>
  );
};
