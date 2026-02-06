import React, { useEffect } from 'react';
import { Download, FileDown, X, Sparkles, PlusCircle, RefreshCw, Play, Mic } from 'lucide-react';
import { Button } from './Button';

export type ToolKey = 'generate' | 'insert' | 'rewrite' | 'voices' | 'playback' | 'export';

const TOOL_ORDER: ToolKey[] = ['generate', 'insert', 'rewrite', 'voices', 'playback', 'export'];

const TOOL_PLACEHOLDERS: Record<ToolKey, string> = {
  generate: 'Generate panel (coming soon).',
  insert: 'Insert panel (coming soon).',
  rewrite: 'Rewrite panel (coming soon).',
  voices: 'Voices panel (coming soon).',
  playback: 'Playback panel (coming soon).',
  export: 'Export panel (coming soon).'
};

const TOOL_CONFIG: Record<ToolKey, { label: string; icon: React.ReactNode }> = {
  generate: { label: 'Generate', icon: <Sparkles className="h-[18px] w-[18px]" /> },
  insert: { label: 'Insert', icon: <PlusCircle className="h-[18px] w-[18px]" /> },
  rewrite: { label: 'Rewrite', icon: <RefreshCw className="h-[18px] w-[18px]" /> },
  voices: { label: 'Voices', icon: <Mic className="h-[18px] w-[18px]" /> },
  playback: { label: 'Playback', icon: <Play className="h-[18px] w-[18px]" /> },
  export: { label: 'Export', icon: <Download className="h-[18px] w-[18px]" /> }
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

  return (
    <div className="w-full shrink-0 px-4 pb-3">
      <div className="mx-auto w-full max-w-6xl flex flex-col">
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
        <div className="rounded-2xl border border-gray-800 bg-gray-950/95 px-3 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 text-gray-400">
            {TOOL_ORDER.map((tool) => {
              const isActive = activeTool === tool;
              const config = TOOL_CONFIG[tool];
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => onSelectTool(tool)}
                  aria-label={config.label}
                  aria-pressed={isActive}
                  className={`group w-full min-h-[50px] lg:min-h-[56px] rounded-xl lg:rounded-2xl px-2.5 lg:px-3 py-2.5 text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-200 ease-out transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 border inline-flex items-center justify-center gap-2.5 touch-manipulation active:scale-[0.98] ${
                    isActive
                      ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_10px_24px_rgba(99,102,241,0.38)]'
                      : 'text-gray-300 border-gray-800 bg-gray-900/45 hover:bg-gray-800/85 hover:text-white hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.35)]'
                  }`}
                >
                  {config.icon}
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
