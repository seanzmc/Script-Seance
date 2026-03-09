import React, { useEffect, useRef, useState } from 'react';
import { Download, FileDown, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';

export type WorkspaceMode = 'setup' | 'draft' | 'cast' | 'play';

export interface WorkspaceShellProps {
  currentMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  hasDraft: boolean;
  title: string;
  canExport: boolean;
  onExportTxt: () => void;
  onExportPdf?: () => void;
  onClearDraft: () => void;
  onOpenPrivacy: () => void;
  children: React.ReactNode;
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  setup: 'Setup',
  draft: 'Draft',
  cast: 'Cast',
  play: 'Play'
};

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  currentMode,
  onModeChange,
  hasDraft,
  title,
  canExport,
  onExportTxt,
  onExportPdf,
  onClearDraft,
  onOpenPrivacy,
  children
}) => {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isProjectMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (projectMenuRef.current?.contains(targetNode)) return;
      setIsProjectMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProjectMenuOpen]);

  useEffect(() => {
    setIsProjectMenuOpen(false);
  }, [currentMode, hasDraft, title]);

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden relative">
      <header className="shrink-0 border-b border-gray-800/70 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.94))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-3 px-4 py-3 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-indigo-200/80">Script Seance</p>
              <h1 className="truncate text-base font-semibold text-white sm:text-lg">
                {title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" ref={projectMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProjectMenuOpen((previous) => !previous)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900/55 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-haspopup="menu"
                  aria-expanded={isProjectMenuOpen}
                  aria-label="Open project actions menu"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Project
                </button>
                {isProjectMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Project actions"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-[120] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-gray-700 bg-gray-950/98 p-3 shadow-[0_18px_38px_rgba(0,0,0,0.42)] backdrop-blur"
                  >
                    <div className="border-b border-gray-800/80 pb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Project Actions</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {hasDraft ? 'Manage exports, privacy, and draft utilities.' : 'Privacy is available now. Export and clear unlock once a draft exists.'}
                      </p>
                    </div>
                    <div className="space-y-3 pt-3">
                      <div className="space-y-1">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Export</p>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onExportTxt();
                            setIsProjectMenuOpen(false);
                          }}
                          disabled={!canExport}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export Script (.txt)
                        </button>
                        {onExportPdf && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onExportPdf();
                              setIsProjectMenuOpen(false);
                            }}
                            disabled={!canExport}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            Export PDF
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onOpenPrivacy();
                          setIsProjectMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Privacy
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onClearDraft();
                          setIsProjectMenuOpen(false);
                        }}
                        disabled={!hasDraft}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear Draft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((mode) => {
              const requiresDraft = mode !== 'setup';
              const disabled = requiresDraft && !hasDraft;
              const isActive = currentMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onModeChange(mode)}
                  disabled={disabled}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-[38px] items-center rounded-full border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                    isActive
                      ? 'border-indigo-300/60 bg-indigo-500/20 text-indigo-100'
                      : 'border-gray-700 bg-gray-900/45 text-gray-300 hover:bg-gray-800'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
};
