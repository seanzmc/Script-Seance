import React from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Loader2, X } from 'lucide-react';
import { Button } from '../Button';
import { SetupForm, type SetupFormState } from '../SetupForm';
import { SETUP_UI_TOKENS } from '../setupUiTokens';
import { fadeSlideYVariants, modalVariants, overlayVariants } from '../motion/primitives';

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
  const setupRailClass = 'mx-auto w-full max-w-[60rem]';
  const startGenerationCard = (
    <m.div
      className="w-full max-w-2xl rounded-3xl border border-indigo-500/30 bg-indigo-500/10 px-10 py-12 text-center space-y-4 shadow-[0_0_40px_rgba(79,70,229,0.2)]"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeSlideYVariants}
    >
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
      <div className="space-y-2">
        <p className="text-xl font-semibold text-white">Generating your opening scene...</p>
        <p className="text-base text-indigo-100/80">Gathering the writers room and shaping the first beat.</p>
        {loadingMessage ? (
          <p className="text-sm text-indigo-100/70" aria-live="polite">
            {loadingMessage}
          </p>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
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
                        ? 'Locking in the opening beat and preparing the workspace.'
                        : 'Pick a genre and let AI shape your opening spark.'}
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
                      className={`${setupRailClass} flex min-h-[calc(100vh-12rem)] items-center justify-center`}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={fadeSlideYVariants}
                    >
                      <div className="w-full max-w-2xl">
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
