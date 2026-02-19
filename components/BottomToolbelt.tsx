import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileDown, X, Sparkles, PlusCircle, RefreshCw, Play, Mic } from 'lucide-react';
import { Button } from './Button';

export type ToolKey = 'generate' | 'insert' | 'rewrite' | 'voices' | 'playback' | 'export';

const TOOL_ORDER: ToolKey[] = ['generate', 'insert', 'rewrite', 'voices', 'playback', 'export'];
const NARROW_VIEWPORT_QUERY = '(max-width: 900px)';

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
  showSelector?: boolean;
  edgeToEdge?: boolean;
  className?: string;
  mobileExpanded?: boolean;
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
  showSelector = true,
  edgeToEdge = false,
  className = '',
  mobileExpanded = false,
  onExportTxt,
  onExportPdf,
  exportDisabled = false,
  generateContent,
  rewriteContent,
  playbackContent,
  voicesContent,
  insertContent
}) => {
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  ));
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const drawerFirstToolButtonRef = useRef<HTMLButtonElement>(null);
  const panelCloseButtonRef = useRef<HTMLButtonElement>(null);
  const activePlaceholder = activeTool ? TOOL_PLACEHOLDERS[activeTool] : null;
  const activeLabel = activeTool ? TOOL_CONFIG[activeTool].label : null;
  const hasExportPanel = activeTool === 'export';
  const hasGeneratePanel = activeTool === 'generate' && Boolean(generateContent);
  const hasRewritePanel = activeTool === 'rewrite' && Boolean(rewriteContent);
  const hasPlaybackPanel = activeTool === 'playback' && Boolean(playbackContent);
  const hasVoicesPanel = activeTool === 'voices' && Boolean(voicesContent);
  const hasInsertPanel = activeTool === 'insert' && Boolean(insertContent);
  const hasActivePanel = Boolean(activeTool);
  const panelHeightClass = activeTool === 'insert'
    ? 'h-[52vh] max-h-[334px] sm:h-[320px] sm:max-h-none lg:h-[300px]'
    : activeTool === 'generate'
      ? 'h-[48vh] max-h-[292px] sm:h-[300px] sm:max-h-none lg:h-[286px]'
      : activeTool === 'export'
        ? 'h-[40vh] max-h-[196px] sm:h-[204px] sm:max-h-none'
        : 'h-[52vh] max-h-[318px] sm:h-[334px] sm:max-h-none';
  const panelBodyPaddingClass = activeTool === 'export'
    ? 'px-4 py-2'
    : activeTool === 'insert'
      ? 'px-4 py-2'
      : 'px-4 py-3';

  const panelBodyContent = hasExportPanel
    ? (
      <div className="h-full min-h-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Export Options</p>
          <p className="text-[10px] text-gray-500">Current draft only</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
  const panelBodyNode = typeof panelBodyContent === 'string'
    ? <p className="text-sm text-gray-300">{panelBodyContent}</p>
    : <div className="min-h-full">{panelBodyContent}</div>;
  const panelLayoutClass = mobileExpanded && hasActivePanel ? 'flex-1 min-h-0' : panelHeightClass;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };

    setIsNarrowViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange);
      return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }
    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  useEffect(() => {
    if (!isNarrowViewport) {
      setIsToolsOpen(false);
    }
  }, [isNarrowViewport]);

  const closeDrawer = useCallback((focusTarget: 'trigger' | 'panel' = 'trigger') => {
    setIsToolsOpen(false);
    requestAnimationFrame(() => {
      if (focusTarget === 'panel' && panelCloseButtonRef.current) {
        panelCloseButtonRef.current.focus();
        return;
      }
      toolsTriggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!isToolsOpen) return;
    requestAnimationFrame(() => {
      if (drawerCloseButtonRef.current) {
        drawerCloseButtonRef.current.focus();
        return;
      }
      drawerFirstToolButtonRef.current?.focus();
    });
  }, [isToolsOpen]);

  useEffect(() => {
    if (!hasActivePanel && !isToolsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isToolsOpen) {
          event.preventDefault();
          closeDrawer();
          return;
        }
        onCloseTool();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer, hasActivePanel, isToolsOpen, onCloseTool]);

  const handleDrawerToolSelect = useCallback((tool: ToolKey) => {
    onSelectTool(tool);
    closeDrawer('panel');
  }, [closeDrawer, onSelectTool]);

  const renderToolButton = (tool: ToolKey, mode: 'inline' | 'drawer', index: number) => {
    const isActive = activeTool === tool;
    const config = TOOL_CONFIG[tool];
    const isDrawerMode = mode === 'drawer';
    const layoutClassName = isDrawerMode
      ? 'w-full min-h-[44px] rounded-xl px-3 py-2 text-[11px]'
      : 'group min-w-0 basis-[calc(50%-0.25rem)] sm:basis-[calc(33.333%-0.5rem)] lg:basis-0 lg:flex-1 min-h-[44px] lg:min-h-[48px] rounded-xl lg:rounded-2xl px-2 lg:px-2.5 py-2 text-[10px] lg:text-[11px]';
    return (
      <button
        key={tool}
        ref={isDrawerMode && index === 0 ? drawerFirstToolButtonRef : undefined}
        type="button"
        onClick={() => (isDrawerMode ? handleDrawerToolSelect(tool) : onSelectTool(tool))}
        aria-label={config.label}
        aria-pressed={isActive}
        data-tool-button="true"
        className={`${layoutClassName} font-semibold uppercase tracking-[0.16em] transition-all duration-200 ease-out transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 border inline-flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98] ${
          isActive
            ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_10px_24px_rgba(99,102,241,0.38)]'
            : 'text-gray-300 border-gray-800 bg-gray-900/45 hover:bg-gray-800/85 hover:text-white hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.35)]'
        }`}
      >
        {config.icon}
        <span>{config.label}</span>
      </button>
    );
  };

  return (
    <div className={`w-full ${edgeToEdge ? 'px-0' : 'px-3 max-[640px]:px-2'} ${mobileExpanded ? 'flex-1 min-h-0 pb-1' : 'shrink-0 pb-2'} ${className}`}>
      <div className={`${edgeToEdge ? 'w-full' : 'mx-auto w-full max-w-6xl'} flex flex-col ${mobileExpanded ? 'h-full min-h-0' : ''}`}>
        {hasActivePanel && (
          <div className={`rounded-2xl border border-gray-800 bg-gray-950 shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex ${panelLayoutClass} flex-col overflow-hidden`}>
            <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-4 py-2.5 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gray-400">{activeLabel}</p>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={onCloseTool}
                  ref={panelCloseButtonRef}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                  aria-label="Close tool panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className={`${panelBodyPaddingClass} flex-1 min-h-0 overflow-y-auto overscroll-contain`}>
              {panelBodyNode}
            </div>
          </div>
        )}
        {showSelector && (
          <div className="rounded-2xl border border-gray-800 bg-gray-950 px-2.5 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
            {isNarrowViewport ? (
              <button
                ref={toolsTriggerRef}
                type="button"
                onClick={() => {
                  if (isToolsOpen) {
                    closeDrawer();
                    return;
                  }
                  setIsToolsOpen(true);
                }}
                aria-haspopup="dialog"
                aria-expanded={isToolsOpen}
                aria-controls="tools-drawer"
              className="w-full min-h-[44px] rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-200 transition-colors hover:bg-gray-800/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Tools
              </button>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto pr-1 text-gray-400 sm:max-h-none sm:overflow-visible sm:pr-0 lg:flex-nowrap">
                {TOOL_ORDER.map((tool, index) => renderToolButton(tool, 'inline', index))}
              </div>
            )}
          </div>
        )}
      </div>
      {showSelector && isNarrowViewport && isToolsOpen && (
        <>
          <div
            className="fixed inset-0 z-[72] bg-black/70 backdrop-blur-sm"
            onClick={() => closeDrawer()}
            aria-hidden="true"
            data-testid="tools-drawer-backdrop"
          />
          <div className="fixed inset-x-0 bottom-0 z-[73] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div
              id="tools-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Tools"
              className="mx-auto w-full max-w-6xl rounded-2xl border border-gray-800 bg-gray-950 shadow-[0_22px_56px_rgba(0,0,0,0.45)] h-[min(70vh,420px)] max-h-[70vh] flex flex-col overflow-hidden"
              data-testid="tools-drawer"
            >
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gray-400">Tools</p>
                <button
                  type="button"
                  ref={drawerCloseButtonRef}
                  onClick={() => closeDrawer()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                  aria-label="Close tools drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <div className="flex flex-col gap-2">
                  {TOOL_ORDER.map((tool, index) => renderToolButton(tool, 'drawer', index))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
