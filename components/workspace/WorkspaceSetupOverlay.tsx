import React from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import { Button } from '../Button';
import { SetupForm, type SetupFormState } from '../SetupForm';
import { SETUP_UI_TOKENS } from '../setupUiTokens';
import { fadeSlideYVariants, modalVariants, overlayVariants } from '../motion/primitives';

const writingAnimStyle = `
  @keyframes ss-write {
    0%   { stroke-dashoffset: 70; opacity: 0; }
    10%  { opacity: 1; }
    75%  { stroke-dashoffset: 0; opacity: 1; }
    90%  { stroke-dashoffset: 0; opacity: 0; }
    100% { stroke-dashoffset: 70; opacity: 0; }
  }
  @keyframes ss-cursor {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ss-write-path { animation: none !important; stroke-dashoffset: 0; opacity: 1; }
    .ss-cursor-blink { animation: none !important; opacity: 1; }
  }
`;

export interface WorkspaceSetupOverlayProps {
  showSetupSurface: boolean;
  showSetupHandoffLoading: boolean;
  isSetupOpen: boolean;
  setupState: SetupFormState;
  isGenerating: boolean;
  loadingMessage?: string;
  setupAutoSurprise: boolean;
  onCloseSetup: () => void;
  onCancelGenerate: () => void;
  onSetupChange: (next: Partial<SetupFormState>, meta?: { source?: 'user' | 'system' }) => void;
  onSetupSurprise?: (params: { mode: 'manual' | 'auto'; targetGenre: string }) => Promise<boolean>;
  onStartSetup: () => void;
  onSetupError?: (error: unknown, fallbackMessage: string) => boolean;
}

export const WorkspaceSetupOverlay: React.FC<WorkspaceSetupOverlayProps> = ({
  showSetupSurface,
  showSetupHandoffLoading,
  isSetupOpen,
  setupState,
  isGenerating,
  loadingMessage,
  setupAutoSurprise,
  onCloseSetup,
  onCancelGenerate,
  onSetupChange,
  onSetupSurprise,
  onStartSetup,
  onSetupError
}) => {
  const prefersReducedMotion = useReducedMotion();
  const setupRailClass = 'mx-auto w-full max-w-[60rem]';
  const startGenerationCard = (
    <m.div
      className="w-full max-w-[42rem] rounded-3xl border border-indigo-500/30 bg-indigo-500/10 px-11 py-14 text-center space-y-7 shadow-[0_0_40px_rgba(79,70,229,0.2)] sm:px-12 sm:py-[3.75rem]"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeSlideYVariants}
    >
      <style>{writingAnimStyle}</style>
      <div className="flex h-8 items-center justify-center gap-1.5" aria-hidden="true">
        <svg width="56" height="16" viewBox="0 0 48 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            className="ss-write-path"
            d="M2 11 C8 3, 16 3, 22 8 S38 3, 46 6"
            stroke="#818cf8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="70"
            strokeDashoffset="70"
            style={{ animation: 'ss-write 2.4s ease-in-out infinite' }}
          />
        </svg>
        <span
          className="ss-cursor-blink select-none text-lg font-light leading-none text-indigo-400/90"
          style={{ animation: 'ss-cursor 1s step-end infinite' }}
        >|</span>
      </div>
      <div className="space-y-3">
        <p className="text-[1.55rem] font-semibold tracking-[-0.01em] text-white sm:text-[1.72rem]">
          Generating your opening scene...
        </p>
        <div className="mx-auto flex min-h-[3.25rem] max-w-[28rem] items-center justify-center px-3">
          {prefersReducedMotion ? (
            loadingMessage ? (
              <p className="text-[1.02rem] leading-relaxed text-indigo-100/82" aria-live="polite">
                {loadingMessage}
              </p>
            ) : null
          ) : (
            <AnimatePresence initial={false} mode="wait">
              {loadingMessage ? (
                <m.p
                  key={loadingMessage}
                  className="text-[1.02rem] leading-relaxed text-indigo-100/82"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {loadingMessage}
                </m.p>
              ) : null}
            </AnimatePresence>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancelGenerate}
        className="rounded-lg border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/10 hover:text-indigo-100"
      >
        Cancel
      </Button>
    </m.div>
  );

  return (
    <AnimatePresence initial={false}>
      {showSetupSurface ? (
        <m.div
          key="setup-screen"
          className="fixed inset-0 z-screen-overlay overflow-y-auto bg-gradient-to-b from-slate-950 via-[#050a18] to-[#04070f]"
          role="region"
          aria-label="Setup"
          data-testid="setup-screen"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={overlayVariants}
        >
          <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.24),_transparent_42%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
            <m.div
              className="flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl bg-slate-950/60 shadow-[0_35px_120px_rgba(2,6,23,0.75)] backdrop-blur-md sm:min-h-[calc(100vh-3rem)]"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={modalVariants}
            >
              <div className="relative border-b border-white/8 px-5 py-4 sm:px-6 sm:py-5">
                <div className={`${setupRailClass} flex items-start justify-between gap-4`}>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.42em] text-indigo-200/70">Setup</p>
                    <h2 className={SETUP_UI_TOKENS.title}>
                      {showSetupHandoffLoading ? 'Starting your script' : 'Start a new script'}
                    </h2>
                    <p className={SETUP_UI_TOKENS.subtitle}>
                      {showSetupHandoffLoading
                        ? 'Opening scene coming up. Setting the stage.'
                        : 'Pick a genre, then cue up your opening scene.'}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center">
                    {!showSetupHandoffLoading ? (
                      <button
                        type="button"
                        onClick={onCloseSetup}
                        className="rounded-full p-2.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Close setup"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    ) : (
                      <span className="h-10 w-10" aria-hidden="true" />
                    )}
                  </div>
                </div>
              </div>
              <div className="relative flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
                <AnimatePresence initial={false} mode="wait">
                  {isSetupOpen ? (
                    <m.div
                      key="setup-surface-form"
                      className={setupRailClass}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={fadeSlideYVariants}
                    >
                      <SetupForm
                        value={setupState}
                        onChange={onSetupChange}
                        onRequestSurprise={onSetupSurprise}
                        onStart={onStartSetup}
                        isLoading={isGenerating}
                        onError={onSetupError}
                        isLocked={false}
                        showSubmit
                        autoSurprise={setupAutoSurprise}
                      />
                    </m.div>
                  ) : (
                    <m.div
                      key="setup-surface-loading"
                      className={`${setupRailClass} pt-10`}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={fadeSlideYVariants}
                    >
                      <div className="w-full max-w-2xl mx-auto">
                        {startGenerationCard}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </m.div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
};
