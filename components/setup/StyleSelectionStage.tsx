import React from "react";
import * as m from "motion/react-m";
import { AlertCircle, Search } from "lucide-react";
import { StyleItem, stylesLibrary } from "../../stylesLibrary";
import { SETUP_UI_TOKENS } from "../setupUiTokens";
import { stageShellVariants } from "../motion/primitives";

export interface StyleSelectionStageProps {
  selectedLibraryStyle: StyleItem | null;
  selectedStyleCategoryLabel: string | null;
  styleSummaryLabel: string;
  styleSummaryDescription: string;
  isStyleBlank: boolean;
  isStyleLibraryOpen: boolean;
  isLoading: boolean;
  isLocked: boolean;
  isSurprising: boolean;
  styleShufflePulse: boolean;
  surpriseError: string | null;
  canHover: boolean;
  layoutId: string | undefined;
  aiButtonRef: React.RefObject<HTMLButtonElement | null>;
  manualButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClearStyle: () => void;
  onOpenStyleLibrary: () => void;
  onShuffleStyle: () => void;
  onAdvance: () => void;
  onSurprise: () => void;
  onTryAgain: () => void;
  onSwitchToManual: () => void;
}

export const StyleSelectionStage: React.FC<StyleSelectionStageProps> = ({
  selectedLibraryStyle,
  selectedStyleCategoryLabel,
  styleSummaryLabel,
  styleSummaryDescription,
  isStyleBlank,
  isStyleLibraryOpen,
  isLoading,
  isLocked,
  isSurprising,
  styleShufflePulse,
  surpriseError,
  canHover,
  layoutId,
  aiButtonRef,
  manualButtonRef,
  onClearStyle,
  onOpenStyleLibrary,
  onShuffleStyle,
  onAdvance,
  onSurprise,
  onTryAgain,
  onSwitchToManual,
}) => {
  const setupUi = SETUP_UI_TOKENS;
  const motionBaseClass =
    "transition-[opacity,transform,box-shadow] duration-[220ms] ease-out";
  const pressFeedbackClass =
    "hover:-translate-y-px active:translate-y-px active:duration-[140ms] active:ease-in-out";
  const focusRingClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
  const interactiveControlClass = `${motionBaseClass} ${pressFeedbackClass} ${focusRingClass}`;
  const setupActionButtonBaseClass = `w-full py-3.5 sm:py-4 ${setupUi.buttonText} transition-[opacity,transform,box-shadow,background-color] duration-[220ms] ease-out hover:-translate-y-px active:duration-[140ms] active:ease-in-out active:translate-y-px text-center rounded-xl`;
  const styleActionButtonBaseClass = `rounded-lg px-3 py-2 ${setupUi.buttonText} ring-1 ${interactiveControlClass}`;
  const stageShellClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)] bg-slate-950/56 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.92)]";
  const sharedSurfaceCardClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)] bg-white/[0.032] px-4 py-3.5 sm:px-5 sm:py-4";
  const styleCardMotionClass =
    "transition-[box-shadow,opacity,transform] duration-[280ms] ease-in-out";
  const styleCardPulseClass = styleShufflePulse
    ? "shadow-[0_14px_34px_-26px_rgba(129,140,248,0.85)]"
    : "shadow-none";

  return (
    <m.div
      key="setup-stage-style"
      layout="position"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={stageShellVariants}
      className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className={setupUi.sectionLabel}>Step 2</p>
          <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Shape the tone
          </h3>
          <p className={setupUi.bodyMutedText}>
            Style stays optional. Pick a vibe if it helps, then choose
            whether AI writes the premise or you do before moving into
            the final setup details.
          </p>
        </div>
        <m.div
          layout
          layoutId={layoutId}
          className={`group ${sharedSurfaceCardClass} ${styleCardMotionClass} ${styleCardPulseClass}`}
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`${setupUi.sectionLabel} text-slate-400`}>
                Selected style
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xl font-semibold leading-tight text-slate-100">
                  {styleSummaryLabel}
                </p>
                {selectedStyleCategoryLabel && (
                  <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300 ring-1 ring-white/12">
                    {selectedStyleCategoryLabel}
                  </span>
                )}
              </div>
            </div>
            {!isStyleBlank && (
              <button
                type="button"
                onClick={onClearStyle}
                disabled={isLocked}
                aria-label="Clear selected style"
                className={`rounded-md px-1.5 py-0.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-indigo-100 hover:underline hover:bg-indigo-500/15 ${interactiveControlClass} ${
                  canHover
                    ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                    : "opacity-100"
                } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                title="Clear selected style"
              >
                × Clear
              </button>
            )}
          </div>

          {selectedLibraryStyle ? (
            <div className="mt-2.5 grid gap-3 lg:grid-cols-[minmax(0,0.94fr)_minmax(12.5rem,0.66fr)]">
              <p className={`${setupUi.bodyText} leading-relaxed`}>
                {selectedLibraryStyle.description}
              </p>
              <div className="rounded-[18px] border border-white/10 bg-slate-950/55 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  Sample line
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {selectedLibraryStyle.sampleLine}
                </p>
              </div>
            </div>
          ) : (
            <p className={`${setupUi.bodyText} mt-2.5`}>
              {styleSummaryDescription}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onShuffleStyle}
              disabled={isLocked || stylesLibrary.length === 0}
              className={`shrink-0 ${styleActionButtonBaseClass} ${
                isLocked || stylesLibrary.length === 0
                  ? "opacity-60 cursor-not-allowed text-slate-300/70 bg-indigo-500/10 ring-indigo-200/25"
                  : "text-slate-100 bg-indigo-500/20 ring-indigo-200/40 hover:opacity-95 hover:shadow-[0_10px_24px_-18px_rgba(129,140,248,0.9)]"
              }`}
            >
              Shuffle
            </button>
            <button
              type="button"
              onClick={onOpenStyleLibrary}
              disabled={isLocked}
              className={`inline-flex items-center gap-1.5 ${styleActionButtonBaseClass} ${
                isLocked
                  ? "opacity-60 cursor-not-allowed text-slate-300/70 bg-indigo-500/10 ring-indigo-200/25"
                  : "text-slate-100 bg-indigo-500/20 ring-indigo-200/40 hover:opacity-95 hover:shadow-[0_10px_24px_-18px_rgba(129,140,248,0.9)]"
              }`}
              aria-haspopup="dialog"
              aria-expanded={isStyleLibraryOpen}
            >
              <Search className="h-3.5 w-3.5" />
              Browse
            </button>
          </div>
        </m.div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            ref={aiButtonRef}
            type="button"
            onClick={onSurprise}
            disabled={isLoading || isSurprising || isLocked}
            aria-busy={isSurprising || undefined}
            aria-disabled={(isLoading || isSurprising || isLocked) || undefined}
            className={`inline-flex items-center justify-center ${setupActionButtonBaseClass} ${focusRingClass} bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100 disabled:opacity-50 disabled:pointer-events-none`}
          >
            {isSurprising ? (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : null}
            Generate AI Premise
          </button>
          <button
            ref={manualButtonRef}
            type="button"
            onClick={onAdvance}
            disabled={isLocked}
            aria-disabled={isLocked || undefined}
            className={`inline-flex items-center justify-center ${setupActionButtonBaseClass} ${focusRingClass} bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 disabled:opacity-50 disabled:pointer-events-none`}
          >
            Write My Own Premise
          </button>
        </div>

        {surpriseError ? (
          <div
            role="alert"
            className="rounded-[20px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <p className="font-medium leading-relaxed">
                  {surpriseError}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onTryAgain}
                    disabled={isLoading || isSurprising || isLocked}
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${
                      isLoading || isSurprising || isLocked
                        ? "cursor-not-allowed bg-rose-200/10 text-rose-100/60"
                        : "bg-rose-200/15 text-rose-50 hover:bg-rose-200/25"
                    }`}
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={onSwitchToManual}
                    disabled={isLocked}
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${
                      isLocked
                        ? "cursor-not-allowed bg-white/[0.06] text-slate-400"
                        : "bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]"
                    }`}
                  >
                    Switch to Manual Premise
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </m.div>
  );
};
