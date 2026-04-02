import React from "react";
import * as m from "motion/react-m";
import { Mars, Plus, Shuffle, Trash2, Users, Venus } from "lucide-react";
import { Button } from "../Button";
import { LengthCycleWheel, SceneLengthValue } from "../LengthCycleWheel";
import { SETUP_UI_TOKENS } from "../setupUiTokens";
import { stageShellVariants } from "../motion/primitives";
import type { VoicePreference } from "../SetupForm";

const STARTER_IDEAS = [
  "Two rivals are forced to work together",
  "A secret threatens to unravel everything",
  "A normal day goes very wrong",
  "One mistake rewrites the entire future",
] as const;

const VOICE_PREFERENCE_META: Record<
  VoicePreference,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  male: { icon: Mars, label: "Male" },
  female: { icon: Venus, label: "Female" },
  random: { icon: Shuffle, label: "Random" },
};

export interface DetailsStageProps {
  premise: string;
  characters: string[];
  characterVoicePreferences: VoicePreference[];
  narratorVoicePreference: VoicePreference;
  length: SceneLengthValue;
  isLoading: boolean;
  isLocked: boolean;
  isSurprising: boolean;
  justSurprised: boolean;
  activePremiseSource: "ai" | "manual";
  showSubmit: boolean;
  prefersReducedMotion: boolean;
  hasValidCharacter: boolean;
  detailsFooterRef: React.RefObject<HTMLDivElement | null>;
  characterInputsRef: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onPremiseChange: (next: string) => void;
  onCharacterChange: (index: number, next: string) => void;
  onLengthChange: (next: SceneLengthValue) => void;
  onNarratorVoiceChange: () => void;
  onCharacterVoiceChange: (index: number) => void;
  onAddCharacter: () => void;
  onRemoveCharacter: (index: number) => void;
  onStarterIdeaClick: (idea: string) => void;
  onStart?: () => void;
}

export const DetailsStage: React.FC<DetailsStageProps> = ({
  premise,
  characters,
  characterVoicePreferences,
  narratorVoicePreference,
  length,
  isLoading,
  isLocked,
  isSurprising,
  justSurprised,
  activePremiseSource,
  showSubmit,
  prefersReducedMotion,
  hasValidCharacter,
  detailsFooterRef,
  characterInputsRef,
  onPremiseChange,
  onCharacterChange,
  onLengthChange,
  onNarratorVoiceChange,
  onCharacterVoiceChange,
  onAddCharacter,
  onRemoveCharacter,
  onStarterIdeaClick,
  onStart,
}) => {
  const setupUi = SETUP_UI_TOKENS;
  const detailPanelClass = "space-y-2.5";
  const stageShellClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)] bg-slate-950/56 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.92)]";
  const detailSectionSurfaceClass =
    "flex h-full min-h-0 flex-col rounded-[16px] border border-white/7 bg-white/[0.02] px-3 py-2.5 sm:px-3.5 sm:py-3";
  const premisePanelClass = `${detailSectionSurfaceClass} ${detailPanelClass} transition-[border-color,background-color] duration-[220ms] ease-out ${
    justSurprised
      ? "border-indigo-300/30 bg-indigo-500/[0.05]"
      : "focus-within:border-white/10 focus-within:bg-white/[0.03]"
  }`;
  const characterPanelClass = `${detailSectionSurfaceClass} ${detailPanelClass}`;
  const characterRowClass = `flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-[border-color,background-color] duration-[220ms] ease-out ${
    justSurprised
      ? "border-indigo-400/35 bg-indigo-500/[0.05]"
      : "border-white/8 bg-white/[0.02]"
  } ${isLocked ? "opacity-60" : "focus-within:border-indigo-300/35 focus-within:bg-white/[0.03]"}`;
  const detailsStageMaxHeightClass = "lg:max-h-[calc(100vh-19.25rem)]";
  const detailsStageShellClass = `${stageShellClass} flex min-h-0 flex-col gap-2.5 overflow-hidden px-4 py-3.5 sm:px-5 sm:py-4 ${detailsStageMaxHeightClass}`;
  const detailsStageGridClass =
    "grid grid-cols-1 gap-2.5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1.16fr)_minmax(16.5rem,0.84fr)] md:items-stretch";
  const characterCount = characters.length;

  const renderVoicePreferenceButton = (
    preference: VoicePreference,
    onClick: () => void,
    options?: { testId?: string; narrator?: boolean },
  ) => {
    const meta = VOICE_PREFERENCE_META[preference];
    const Icon = meta.icon;
    const targetLabel = options?.narrator ? "Narrator" : "Character";
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isLocked}
        aria-label={`${targetLabel} voice preference: ${meta.label}. Click to cycle.`}
        title={`${targetLabel} voice preference: ${meta.label}`}
        data-testid={options?.testId}
        className={`inline-flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-2 text-slate-200 transition-[opacity,color,border-color,background-color] duration-[220ms] ease-out hover:border-indigo-300/55 hover:bg-indigo-500/18 hover:text-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 sm:min-w-[3.25rem] sm:px-2.5 ${
          isLocked ? "opacity-60 cursor-not-allowed" : ""
        } ${options?.narrator ? "border-white/12" : ""}`}
      >
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold leading-none text-slate-100 sm:text-[11px]">
          <span className="sr-only">Voice </span>
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{meta.label}</span>
        </span>
      </button>
    );
  };

  return (
    <m.div
      key="setup-stage-details"
      layout="position"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={stageShellVariants}
      className={detailsStageShellClass}
      data-testid="setup-details-stage-shell"
    >
      <div className="space-y-1">
        <p className={setupUi.sectionLabel}>Step 3</p>
        <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Build the opening spark
        </h3>
      </div>

      <m.div
        layout="position"
        className={detailsStageGridClass}
      >
        <div
          className={premisePanelClass}
          data-testid="setup-premise-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label className={setupUi.sectionLabel}>
                Premise
              </label>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {activePremiseSource === "ai" ? "AI-written" : "Your draft"}
              </span>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.2)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/35">
              <textarea
                rows={5}
                value={premise}
                onChange={(event) => {
                  onPremiseChange(event.target.value);
                }}
                className={`w-full flex-1 min-h-[124px] resize-none border-0 bg-transparent px-0 py-1 pr-1.5 text-[15px] leading-relaxed text-slate-100 caret-indigo-200 placeholder:text-slate-500 selection:bg-indigo-500/35 selection:text-white focus:outline-none sm:text-base lg:min-h-[114px] [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.32)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/45 ${
                  isLocked ? "cursor-not-allowed text-slate-400" : ""
                }`}
                placeholder="e.g., A detective discovers his new partner is a ghost..."
                disabled={isLocked}
              />
              {activePremiseSource === "manual" && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {STARTER_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => onStarterIdeaClick(idea)}
                      disabled={isLocked}
                      className="rounded-full border border-white/8 bg-transparent px-2.5 py-1 text-left text-[11px] text-slate-400 transition-[opacity,color,border-color,background-color] duration-[220ms] ease-out hover:border-white/14 hover:bg-white/[0.03] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={characterPanelClass}
          data-testid="setup-characters-panel"
        >
          <div className="flex h-full flex-1 flex-col space-y-1.5">
            <label className={`${setupUi.sectionLabel} flex items-center gap-2`}>
              <Users className="w-3.5 h-3.5 text-indigo-300" /> Characters
            </label>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.2)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/35">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm sm:text-base font-medium text-white">
                      Narrator
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                      Always present
                    </p>
                  </div>
                </div>
                {renderVoicePreferenceButton(
                  narratorVoicePreference,
                  onNarratorVoiceChange,
                  {
                    testId: "setup-narrator-preference",
                    narrator: true,
                  },
                )}
              </div>
              {characters.map((char, index) => (
                <div
                  key={index}
                  className={characterRowClass}
                >
                  <input
                    ref={(element) => {
                      characterInputsRef.current[index] = element;
                    }}
                    value={char}
                    onChange={(event) =>
                      onCharacterChange(index, event.target.value)
                    }
                    className={`min-w-0 flex-1 bg-transparent px-0 py-1 text-sm text-white placeholder-slate-500 focus:outline-none sm:text-base ${
                      isLocked ? "cursor-not-allowed text-slate-400" : ""
                    }`}
                    placeholder="Name"
                    disabled={isLocked}
                  />
                  {renderVoicePreferenceButton(
                    characterVoicePreferences[index] ?? "random",
                    () => onCharacterVoiceChange(index),
                    {
                      testId: `setup-character-preference-${index}`,
                    },
                  )}
                  {characters.length > 1 && !isLocked && (
                    <button
                      type="button"
                      onClick={() => onRemoveCharacter(index)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-500 transition-[color,border-color,background-color] duration-200 hover:border-red-300/35 hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-1 focus:ring-offset-slate-950"
                      aria-label="Remove character"
                      title="Remove character"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={onAddCharacter}
                disabled={isLocked}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/14 py-2 text-sm font-medium text-slate-300 transition-[opacity,color,border-color,background-color] duration-[220ms] ease-out hover:border-white/22 hover:bg-white/[0.03] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5" /> Add Character
              </button>
            </div>
          </div>
        </div>
      </m.div>

      <div
        ref={detailsFooterRef}
        className="mt-0.5 pt-1.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5 text-sm text-slate-400 sm:items-center">
          <LengthCycleWheel
            value={length}
            disabled={isLocked}
            prefersReducedMotion={prefersReducedMotion}
            focusRingClass="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
            onChange={onLengthChange}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Cast
            </span>
            <p className={setupUi.metaText}>
              {characterCount}{" "}
              {characterCount === 1 ? "character" : "characters"}
            </p>
          </div>
        </div>

        {showSubmit && onStart && (
          <Button
            variant="primary"
            onClick={onStart}
            className="mt-2.5 w-full !bg-indigo-600/95 py-3.5 text-base font-medium shadow-[0_18px_34px_-24px_rgba(99,102,241,0.82)] transition-all hover:!bg-indigo-500"
            loading={isLoading}
            size="md"
            disabled={
              !premise.trim() ||
              !hasValidCharacter ||
              isLoading ||
              isSurprising ||
              isLocked
            }
            title="Generate your opening scene"
          >
            Generate First Scene
          </Button>
        )}
      </div>
    </m.div>
  );
};
