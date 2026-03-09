import React from 'react';
import { AlertCircle } from 'lucide-react';
import { SetupForm, SetupFormState } from '../SetupForm';

export interface SetupModeProps {
  setupState: SetupFormState;
  onSetupChange: (next: Partial<SetupFormState>, meta?: { source?: 'user' | 'system' }) => void;
  onSetupSurprise?: (params: { mode: 'manual' | 'auto'; targetGenre: string }) => Promise<boolean>;
  onStartSetup: () => void;
  setupAutoSurprise: boolean;
  isGenerating: boolean;
  error: string | null;
  onSetupError?: (error: unknown, fallbackMessage: string) => boolean;
}

export const SetupMode: React.FC<SetupModeProps> = ({
  setupState,
  onSetupChange,
  onSetupSurprise,
  onStartSetup,
  setupAutoSurprise,
  isGenerating,
  error,
  onSetupError
}) => (
  <section className="h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-[#050a18] to-[#04070f]">
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.24),_transparent_42%)]" />
      <div className="relative overflow-hidden rounded-3xl bg-slate-950/60 shadow-[0_35px_120px_rgba(2,6,23,0.75)] backdrop-blur-md">
        <div className="border-b border-white/10 px-6 py-5 sm:px-7">
          <p className="text-[10px] uppercase tracking-[0.42em] text-indigo-200/70">Setup Workspace</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Start a new script</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300/80 sm:text-base">
            Define genre, tone, premise, cast, and target length before generating the opening scene.
          </p>
        </div>
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {error && (
            <div className="mb-5 rounded-lg border border-red-500/60 bg-red-900/40 p-4 text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            </div>
          )}
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
        </div>
      </div>
    </div>
  </section>
);
