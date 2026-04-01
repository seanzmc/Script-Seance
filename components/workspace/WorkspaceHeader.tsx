import React from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import {
  ChevronDown,
  Download,
  FileDown,
  List,
  Loader2,
  Pencil,
  Redo2,
  Sparkles,
  Speech,
  Trash2,
  Undo2
} from 'lucide-react';
import { fadeSlideYVariants } from '../motion/primitives';
import type { StoryContext } from '../../types';

type InlineTooltipProps = {
  label: string;
  children: React.ReactNode;
  wrapperClassName?: string;
};

const InlineTooltip = ({ label, children, wrapperClassName }: InlineTooltipProps) => (
  <span className={`group relative inline-flex ${wrapperClassName ?? ''}`.trim()}>
    {children}
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-6 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-gray-700 bg-gray-950/95 px-2 py-1 text-[10px] font-medium text-gray-100 opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
    >
      {label}
    </span>
  </span>
);

export interface WorkspaceHeaderProps {
  context: StoryContext;
  autosaveError: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  canExport: boolean;
  isPlaying: boolean;
  isGenerating: boolean;
  isGenerateMenuOpen: boolean;
  isOutlineOpen: boolean;
  isAudioDrawerOpen: boolean;
  isExportMenuOpen: boolean;
  onUndo: () => void;
  onRedo?: () => void;
  onClearDraft: () => void;
  onExportTxt: () => void;
  onExportPdf?: () => void;
  onOpenTitleModal: () => void;
  onOpenStyleModal?: () => void;
  onToggleExportMenu: () => void;
  onToggleGenerateMenu: () => void;
  onOpenOutline: () => void;
  onOpenAudioDrawer: () => void;
  onCancelGenerate: () => void;
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  generateMenuRef: React.RefObject<HTMLDivElement | null>;
  composerPanel: React.ReactNode;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  context,
  autosaveError,
  canUndo,
  canRedo,
  canExport,
  isPlaying,
  isGenerating,
  isGenerateMenuOpen,
  isOutlineOpen,
  isAudioDrawerOpen,
  isExportMenuOpen,
  onUndo,
  onRedo,
  onClearDraft,
  onExportTxt,
  onExportPdf,
  onOpenTitleModal,
  onOpenStyleModal,
  onToggleExportMenu,
  onToggleGenerateMenu,
  onOpenOutline,
  onOpenAudioDrawer,
  onCancelGenerate,
  exportMenuRef,
  generateMenuRef,
  composerPanel
}) => {
  const genreLabel = context.genre;
  const styleLabel = context.style?.trim() || '';
  const headerMetaLabelClass = 'font-semibold text-gray-100';
  const headerMetaItemClass = 'inline-flex items-center gap-2 whitespace-nowrap';
  const headerMetaBulletClass = 'text-gray-500';
  const headerActionSlotClass = 'min-w-0 flex-1 xl:min-w-fit xl:flex-none';
  const headerToolButtonClass = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/55 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 xl:w-auto max-[1279px]:px-2.5 max-[820px]:h-10 max-[820px]:px-0';
  const headerToolTextClass = 'max-[820px]:sr-only';
  const headerPrimaryToolButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-400/40 bg-indigo-500/15 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:px-5 sm:text-sm xl:w-auto max-[1279px]:px-3 max-[820px]:h-10 max-[820px]:px-0';
  const headerAudioButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-900/55 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:px-5 sm:text-sm xl:w-auto max-[1279px]:px-3 max-[820px]:h-10 max-[820px]:px-0';
  const headerActionRowsClass = 'flex w-full items-stretch gap-2 xl:w-auto xl:items-center';
  const generateMenuDialog = (
    <AnimatePresence initial={false}>
      {isGenerateMenuOpen ? (
        <m.div
          key="generate-menu-desktop-panel"
          role="dialog"
          aria-label="Generate menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-popover w-[min(28rem,calc(100vw-1.5rem))]"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={fadeSlideYVariants}
        >
          {composerPanel}
        </m.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="relative z-header shrink-0 border-b border-gray-800/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.68),rgba(15,23,42,0.38))] backdrop-blur">
      <div className="relative max-w-[1240px] mx-auto px-6 max-[900px]:px-4 max-[640px]:px-3 py-4 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-indigo-200/80">Script Seance</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-[0.08em] text-white sm:text-2xl">
                {context.title?.trim() ? context.title : 'Untitled Screenplay'}
              </h1>
              <button
                type="button"
                onClick={onOpenTitleModal}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-200"
                title="Edit title"
              >
                <Pencil className="h-3 w-3" />
                Edit Title
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-300">
              <span className={headerMetaItemClass}>
                <span><span className={headerMetaLabelClass}>Genre:</span> {genreLabel}</span>
              </span>
              <span className={headerMetaItemClass}>
                <span aria-hidden="true" className={headerMetaBulletClass}>&bull;</span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span><span className={headerMetaLabelClass}>Style:</span> {styleLabel || 'Default tone'}</span>
                  {onOpenStyleModal && (
                    <button
                      type="button"
                      onClick={onOpenStyleModal}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-200"
                      title="Edit style"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit Style
                    </button>
                  )}
                </span>
              </span>
              {autosaveError && (
                <span className={headerMetaItemClass}>
                  <span aria-hidden="true" className={headerMetaBulletClass}>&bull;</span>
                  <span className="text-amber-400">{autosaveError}</span>
                </span>
              )}
            </div>
          </div>

          <div className="relative flex w-full flex-col items-stretch gap-2 xl:w-auto xl:items-end xl:justify-start">
            <div className={headerActionRowsClass}>
              <div className={headerActionSlotClass}>
                <InlineTooltip label="Undo" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={headerToolButtonClass}
                    aria-label="Undo"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span className={headerToolTextClass}>Undo</span>
                  </button>
                </InlineTooltip>
              </div>
              <div className={headerActionSlotClass}>
                <InlineTooltip label="Redo" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={() => onRedo?.()}
                    disabled={!canRedo || !onRedo}
                    className={headerToolButtonClass}
                    aria-label="Redo"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                    <span className={headerToolTextClass}>Redo</span>
                  </button>
                </InlineTooltip>
              </div>
              <div className={`relative ${headerActionSlotClass}`} ref={exportMenuRef}>
                <InlineTooltip label="Export" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onToggleExportMenu}
                    disabled={!canExport}
                    className={headerToolButtonClass}
                    aria-haspopup="menu"
                    aria-expanded={isExportMenuOpen}
                    aria-label="Open export menu"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className={headerToolTextClass}>Export</span>
                  </button>
                </InlineTooltip>
                {isExportMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Export options"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-popover min-w-[12rem] rounded-xl border border-gray-700 bg-gray-950 p-2 shadow-[0_18px_38px_rgba(0,0,0,0.42)]"
                  >
                    <div className="space-y-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={onExportTxt}
                        disabled={!canExport}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Export script as a .txt file"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export Script (.txt)
                      </button>
                      {onExportPdf && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={onExportPdf}
                          disabled={!canExport}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Export script as a PDF via print dialog"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Export PDF
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className={headerActionSlotClass}>
                <InlineTooltip label="Clear Draft" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onClearDraft}
                    disabled={!context}
                    className={`${headerToolButtonClass} border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-60`}
                    aria-label="Clear Draft"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className={headerToolTextClass}>Clear Draft</span>
                  </button>
                </InlineTooltip>
              </div>
            </div>
            <div className={headerActionRowsClass}>
              <div className={`relative ${headerActionSlotClass}`} ref={generateMenuRef}>
                <InlineTooltip label="Generate Next Scene" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onToggleGenerateMenu}
                    disabled={isPlaying}
                    className={headerPrimaryToolButtonClass}
                    aria-haspopup="dialog"
                    aria-expanded={isGenerateMenuOpen}
                    aria-label="Open generate menu"
                  >
                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className={headerToolTextClass}>GENERATE NEXT SCENE</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform max-[940px]:hidden ${isGenerateMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </InlineTooltip>
                {generateMenuDialog}
              </div>
              <div className={headerActionSlotClass}>
                <InlineTooltip label="Scene outline" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onOpenOutline}
                    disabled={!context}
                    className={headerAudioButtonClass}
                    aria-haspopup="dialog"
                    aria-expanded={isOutlineOpen}
                    aria-label="Open scene outline"
                  >
                    <List className="h-4 w-4" />
                    <span className={headerToolTextClass}>Outline</span>
                  </button>
                </InlineTooltip>
              </div>
              <div className={headerActionSlotClass}>
                <InlineTooltip label="Audio" wrapperClassName="flex w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={onOpenAudioDrawer}
                    className={headerAudioButtonClass}
                    aria-haspopup="dialog"
                    aria-expanded={isAudioDrawerOpen}
                    aria-label="Open audio drawer"
                  >
                    <Speech className="h-4 w-4" />
                    <span className={headerToolTextClass}>Audio</span>
                  </button>
                </InlineTooltip>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isGenerating ? (
                <m.div
                  key="writing-indicator"
                  className="pointer-events-none absolute right-0 top-full z-6 mt-2 flex justify-end max-[940px]:left-1/2 max-[940px]:right-auto max-[940px]:-translate-x-1/2"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={fadeSlideYVariants}
                >
                  <div
                    aria-live="polite"
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-100 shadow-[0_14px_28px_rgba(15,23,42,0.24)]"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Writing
                    <button
                      type="button"
                      onClick={onCancelGenerate}
                      className="rounded-full border border-indigo-300/30 px-2 py-0.5 text-[9px] tracking-[0.16em] text-indigo-100 transition-colors hover:bg-indigo-400/10"
                    >
                      Cancel
                    </button>
                  </div>
                </m.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
