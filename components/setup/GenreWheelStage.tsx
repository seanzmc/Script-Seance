import React from "react";
import * as m from "motion/react-m";
import { GenreCycleWheel } from "../GenreCycleWheel";
import { SETUP_UI_TOKENS } from "../setupUiTokens";
import { stageShellVariants } from "../motion/primitives";

export interface GenreWheelStageProps {
  genre: string;
  isLocked: boolean;
  prefersReducedMotion: boolean;
  layoutId: string | undefined;
  continueButtonRef: React.RefObject<HTMLButtonElement | null>;
  onGenreChange: (next: string) => void;
  onAdvance: () => void;
}

export const GenreWheelStage: React.FC<GenreWheelStageProps> = ({
  genre,
  isLocked,
  prefersReducedMotion,
  layoutId,
  continueButtonRef,
  onGenreChange,
  onAdvance,
}) => {
  const setupUi = SETUP_UI_TOKENS;
  const focusRingClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
  const stageShellClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)] bg-slate-950/56 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.92)]";
  const sharedSurfaceCardClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)] bg-white/[0.032] px-4 py-3.5 sm:px-5 sm:py-4";
  const setupActionButtonBaseClass = `w-full py-3.5 sm:py-4 ${setupUi.buttonText} transition-[opacity,transform,box-shadow,background-color] duration-[220ms] ease-out hover:-translate-y-px active:duration-[140ms] active:ease-in-out active:translate-y-px text-center rounded-xl`;

  return (
    <m.div
      key="setup-stage-genre"
      layout="position"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={stageShellVariants}
      className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_auto] lg:items-center">
        <div className="space-y-3">
          <div className="space-y-2">
            <p className={setupUi.sectionLabel}>Step 1</p>
            <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
              Start with a genre
            </h3>
          </div>
          <button
            ref={continueButtonRef}
            type="button"
            onClick={onAdvance}
            disabled={isLocked}
            data-testid="setup-continue-to-style"
            className={`${setupActionButtonBaseClass} ${focusRingClass} max-w-xs ${
              isLocked
                ? "cursor-not-allowed bg-indigo-500/12 text-slate-400 opacity-60"
                : "bg-indigo-600 text-white ring-1 ring-indigo-400/50 shadow-[0_12px_24px_-8px_rgba(99,102,241,0.55)] hover:bg-indigo-500"
            }`}
          >
            Continue to Style
          </button>
        </div>
        <div className="flex justify-start lg:justify-end">
          <m.div
            layout
            layoutId={layoutId}
            className={`${sharedSurfaceCardClass} w-full max-w-[24rem]`}
          >
            <p className={`${setupUi.sectionLabel} text-slate-400`}>
              Selected genre
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <GenreCycleWheel
                value={genre}
                disabled={isLocked}
                prefersReducedMotion={prefersReducedMotion}
                focusRingClass={focusRingClass}
                onChange={onGenreChange}
              />
            </div>
          </m.div>
        </div>
      </div>
    </m.div>
  );
};
