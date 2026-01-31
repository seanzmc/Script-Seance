import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  currentStep,
  onStepChange,
  primaryAction,
  header,
  children,
  footer,
  isDisabled = false,
  showPrimaryAction = true,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const activeMeta = FLOW_STEPS.find(step => step.id === currentStep) || FLOW_STEPS[0];
  const interactionClass = isDisabled ? 'pointer-events-none select-none' : '';
  const activeIndex = FLOW_STEPS.findIndex(step => step.id === currentStep);

  if (isCollapsed) {
    return (
      <aside
        className={`w-12 bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col items-center py-4 ${
          isDisabled ? 'opacity-50' : ''
        }`}
        aria-label="Control panel"
        aria-disabled={isDisabled}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          aria-label="Expand tools"
          disabled={isDisabled}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="mt-6 text-[10px] uppercase tracking-[0.3em] text-gray-500 rotate-90">
          Tools
        </span>
      </aside>
    );
  }

  return (
    <aside
      className={`w-full lg:w-[380px] lg:min-w-[340px] lg:max-w-[420px] lg:h-screen bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col shrink-0 ${
        isDisabled ? 'opacity-50' : ''
      }`}
      aria-label="Control panel"
      aria-disabled={isDisabled}
    >
      <div className={`p-4 border-b border-gray-700 bg-gray-900/40 shrink-0 ${interactionClass}`}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Flow</p>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  aria-label="Collapse tools"
                  disabled={isDisabled}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                {FLOW_STEPS.map((step, index) => {
                  const isActive = step.id === currentStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => onStepChange?.(step.id)}
                      disabled={isDisabled}
                      className={`flex items-center gap-2 text-[10px] uppercase tracking-widest transition-colors ${
                        isActive ? 'text-indigo-200' : 'text-gray-500 hover:text-gray-300'
                      }`}
                      aria-current={isActive ? 'step' : undefined}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isActive ? 'bg-indigo-400' : 'bg-gray-600'
                        }`}
                      />
                      <span className="hidden sm:inline">{step.label}</span>
                      {index < FLOW_STEPS.length - 1 && (
                        <span className="hidden sm:inline text-gray-600">-</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <span className="text-[9px] uppercase tracking-widest text-gray-500">
                {activeIndex + 1}/{FLOW_STEPS.length}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">{activeMeta.instruction}</p>
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

      <div className={`flex-1 overflow-y-auto lg:overflow-visible p-4 space-y-5 custom-scrollbar ${interactionClass}`}>
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
