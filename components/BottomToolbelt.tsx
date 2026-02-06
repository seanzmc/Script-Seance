import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, X, Sparkles, PlusCircle, RefreshCw, Play, Mic, MoreHorizontal } from 'lucide-react';
import { Button } from './Button';

export type ToolKey = 'generate' | 'insert' | 'rewrite' | 'voices' | 'playback' | 'export';

const TOOL_GROUPS: ToolKey[][] = [
  ['generate', 'insert', 'rewrite'],
  ['voices', 'playback'],
  ['export']
];

const TOOL_PLACEHOLDERS: Record<ToolKey, string> = {
  generate: 'Generate panel (coming soon).',
  insert: 'Insert panel (coming soon).',
  rewrite: 'Rewrite panel (coming soon).',
  voices: 'Voices panel (coming soon).',
  playback: 'Playback panel (coming soon).',
  export: 'Export panel (coming soon).'
};

const TOOL_CONFIG: Record<ToolKey, { label: string; icon: React.ReactNode }> = {
  generate: { label: 'Generate', icon: <Sparkles className="h-4 w-4" /> },
  insert: { label: 'Insert', icon: <PlusCircle className="h-4 w-4" /> },
  rewrite: { label: 'Rewrite', icon: <RefreshCw className="h-4 w-4" /> },
  voices: { label: 'Voices', icon: <Mic className="h-4 w-4" /> },
  playback: { label: 'Playback', icon: <Play className="h-4 w-4" /> },
  export: { label: 'Export', icon: <Download className="h-4 w-4" /> }
};

export interface BottomToolbeltProps {
  activeTool: ToolKey | null;
  onSelectTool: (tool: ToolKey) => void;
  onCloseTool: () => void;
  onExportTxt?: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  generateContent?: React.ReactNode;
  rewriteContent?: React.ReactNode;
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
  generateContent,
  rewriteContent,
  playbackContent,
  voicesContent,
  insertContent
}) => {
  const [isCompact, setIsCompact] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const activePlaceholder = activeTool ? TOOL_PLACEHOLDERS[activeTool] : null;
  const activeLabel = activeTool ? TOOL_CONFIG[activeTool].label : null;
  const hasExportPanel = activeTool === 'export';
  const hasGeneratePanel = activeTool === 'generate' && Boolean(generateContent);
  const hasRewritePanel = activeTool === 'rewrite' && Boolean(rewriteContent);
  const hasPlaybackPanel = activeTool === 'playback' && Boolean(playbackContent);
  const hasVoicesPanel = activeTool === 'voices' && Boolean(voicesContent);
  const hasInsertPanel = activeTool === 'insert' && Boolean(insertContent);
  const hasActivePanel = Boolean(activeTool);

  const panelBodyContent = hasExportPanel
    ? (
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
    )
    : hasGeneratePanel
      ? generateContent
      : hasRewritePanel
        ? rewriteContent
        : hasPlaybackPanel
          ? playbackContent
          : hasVoicesPanel
            ? voicesContent
            : hasInsertPanel
              ? insertContent
              : activePlaceholder;

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

  useEffect(() => {
    const updateCompact = () => {
      setIsCompact(window.innerWidth < 900);
    };
    updateCompact();
    window.addEventListener('resize', updateCompact);
    return () => window.removeEventListener('resize', updateCompact);
  }, []);

  useEffect(() => {
    if (!isOverflowOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const root = target.closest('[data-toolbelt-overflow="true"]');
      if (!root) {
        setIsOverflowOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [isOverflowOpen]);

  const compactPrimaryTools = useMemo<ToolKey[]>(() => (
    ['generate', 'insert', 'rewrite', 'playback']
  ), []);
  const compactOverflowTools = useMemo<ToolKey[]>(() => (
    ['voices', 'export']
  ), []);
  return (
    <div className="w-full shrink-0 px-4 pb-4">
      <div className={`mx-auto w-full max-w-6xl flex flex-col ${hasActivePanel ? 'gap-2' : ''}`}>
        {hasActivePanel && (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex flex-col min-h-[180px] max-h-[320px] overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-4 py-2.5 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gray-400">{activeLabel}</p>
              <button
                type="button"
                onClick={onCloseTool}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label="Close tool panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
              {typeof panelBodyContent === 'string' ? (
                <p className="text-sm text-gray-300">{panelBodyContent}</p>
              ) : (
                panelBodyContent
              )}
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
          {isCompact ? (
            <div className="grid grid-cols-5 gap-2 text-gray-400">
              {compactPrimaryTools.map((tool) => {
                const isActive = activeTool === tool;
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => onSelectTool(tool)}
                    aria-label={TOOL_CONFIG[tool].label}
                    aria-pressed={isActive}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.25em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 border ${
                      isActive
                        ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_0_1px_rgba(99,102,241,0.6)]'
                        : 'text-gray-400 border-gray-800 bg-gray-900/40 hover:bg-gray-800/80 hover:text-white'
                    }`}
                >
                  {TOOL_CONFIG[tool].icon}
                  <span>{TOOL_CONFIG[tool].label}</span>
                </button>
              );
              })}
              <div className="relative" data-toolbelt-overflow="true">
                <button
                  type="button"
                  onClick={() => setIsOverflowOpen((open) => !open)}
                  aria-label="More tools"
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.25em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 border ${
                    isOverflowOpen
                      ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_0_1px_rgba(99,102,241,0.6)]'
                      : 'text-gray-400 border-gray-800 bg-gray-900/40 hover:bg-gray-800/80 hover:text-white'
                  }`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span>More</span>
                </button>
                {isOverflowOpen && (
                  <div className="absolute right-0 bottom-14 w-48 rounded-xl border border-gray-800 bg-gray-950 shadow-[0_20px_40px_rgba(0,0,0,0.45)] p-2 text-xs">
                    <div className="space-y-1">
                      {compactOverflowTools.map((tool) => {
                        const isActive = activeTool === tool;
                        return (
                          <button
                            key={tool}
                            type="button"
                            onClick={() => {
                              onSelectTool(tool);
                              setIsOverflowOpen(false);
                            }}
                            aria-pressed={isActive}
                            className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                              isActive
                                ? 'bg-indigo-500 text-white'
                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            {TOOL_CONFIG[tool].icon}
                            <span className="text-[10px] uppercase tracking-[0.3em]">{TOOL_CONFIG[tool].label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] uppercase tracking-[0.35em] text-gray-400">
              {TOOL_GROUPS.map((group, groupIndex) => (
                <React.Fragment key={`tool-group-${groupIndex}`}>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {group.map((tool) => {
                      const isActive = activeTool === tool;
                      const config = TOOL_CONFIG[tool];
                      return (
                        <button
                          key={tool}
                          type="button"
                          onClick={() => onSelectTool(tool)}
                          aria-label={config.label}
                          aria-pressed={isActive}
                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 border inline-flex items-center gap-2 ${
                            isActive
                              ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_0_1px_rgba(99,102,241,0.6)]'
                              : 'text-gray-400 border-gray-800 bg-gray-900/40 hover:bg-gray-800/80 hover:text-white'
                          }`}
                        >
                          {config.icon}
                          {config.label}
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
          )}
        </div>
      </div>
    </div>
  );
};
