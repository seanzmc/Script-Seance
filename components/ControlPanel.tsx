import React from 'react';
import { PrimaryActionButton } from './PrimaryActionButton';

export type ControlStep = 'setup' | 'script' | 'voices' | 'playback';

export interface StepResolutionState {
  requestedStep: ControlStep;
  hasScript: boolean;
  hasConfirmedSetup: boolean;
}

export const resolveStep = ({
  requestedStep,
  hasScript,
  hasConfirmedSetup
}: StepResolutionState): ControlStep => {
  if (!hasScript || !hasConfirmedSetup) {
    return 'setup';
  }
  return requestedStep;
};

const FLOW_STEPS: Array<{ id: ControlStep; label: string; instruction: string }> = [
  { id: 'setup', label: 'Setup', instruction: 'Pick your premise and cast.' },
  { id: 'script', label: 'Script', instruction: 'Generate or write your next scene.' },
  { id: 'voices', label: 'Voices', instruction: 'Assign a voice to each character.' },
  { id: 'playback', label: 'Playback', instruction: 'Generate audio and play.' }
];

export interface PrimaryActionConfig {
  label: string;
  onClick: () => void;
  helperText?: string;
  disabled?: boolean;
  loading?: boolean;
}

export interface ControlPanelProps {
  currentStep: ControlStep;
  onStepChange?: (step: ControlStep) => void;
  primaryAction: PrimaryActionConfig;
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isDisabled?: boolean;
  showPrimaryAction?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  currentStep,
  onStepChange,
  primaryAction,
  header,
  children,
  footer,
  isDisabled = false,
  showPrimaryAction = true
}) => {
  const activeMeta = FLOW_STEPS.find(step => step.id === currentStep) || FLOW_STEPS[0];
  const interactionClass = isDisabled ? 'pointer-events-none select-none' : '';

  return (
    <aside
      className={`w-full lg:w-[380px] lg:min-w-[340px] lg:max-w-[420px] bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col shrink-0 ${
        isDisabled ? 'opacity-50' : ''
      }`}
      aria-label="Control panel"
      aria-disabled={isDisabled}
    >
      <div className={`p-4 border-b border-gray-700 bg-gray-900/40 shrink-0 ${interactionClass}`}>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Flow</p>
            <div className="mt-3 space-y-2">
              {FLOW_STEPS.map((step, index) => {
                const isActive = step.id === currentStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onStepChange?.(step.id)}
                    disabled={isDisabled}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left w-full ${
                      isActive
                        ? 'border-indigo-400/40 bg-indigo-500/15 text-white'
                        : 'border-gray-800 bg-gray-900/40 text-gray-500'
                    }`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                        isActive ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                          {step.label}
                        </span>
                        {isActive && (
                          <span className="text-[9px] uppercase tracking-widest text-indigo-300">
                            You are here
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">{activeMeta.instruction}</p>
          </div>
          {showPrimaryAction && (
            <PrimaryActionButton
              label={primaryAction.label}
              onClick={primaryAction.onClick}
              helperText={primaryAction.helperText}
              disabled={primaryAction.disabled}
              loading={primaryAction.loading}
            />
          )}
          {header}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar ${interactionClass}`}>
        {children}
      </div>

      {footer && (
        <div className={`p-4 border-t border-gray-700 bg-gray-900/60 shrink-0 ${interactionClass}`}>
          <div className="flex flex-col gap-2">{footer}</div>
        </div>
      )}
    </aside>
  );
};
