import React, { useState, useRef, useEffect, useCallback } from "react";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Users, Plus, Trash2, Shuffle, ChevronDown } from "lucide-react";
import { generateSurpriseSetup } from "../services/gemini";

export type SetupFormState = {
  genre: string;
  premise: string;
  characters: string[];
  style: string;
  length: string;
};

export interface SetupFormProps {
  value: SetupFormState;
  onChange: (next: Partial<SetupFormState>) => void;
  onStart?: () => void;
  isLoading: boolean;
  onError?: (error: unknown, fallbackMessage: string) => boolean;
  isLocked?: boolean;
  showSubmit?: boolean;
  onEditSetup?: () => void;
  onClearDraft?: () => void;
  variant?: "full" | "summary";
  autoSurprise?: boolean;
}

const STARTER_IDEAS = [
  "Two rivals are forced to work together",
  "A secret threatens to unravel everything",
  "A normal day goes very wrong",
  "One mistake rewrites the entire future",
];

const LENGTH_OPTIONS = ["Short", "Medium", "Long"];
const STYLE_SUGGESTIONS = ["Dry humor", "Cinematic", "Fast-paced", "Lyrical", "Unhinged"];

export const SetupForm: React.FC<SetupFormProps> = ({
  value,
  onChange,
  onStart,
  isLoading,
  onError,
  isLocked,
  showSubmit = false,
  onEditSetup,
  onClearDraft,
  variant = "full",
  autoSurprise = false,
}) => {
  const { genre, premise, characters, style, length } = value;
  const [isSurprising, setIsSurprising] = useState(false);
  const [justSurprised, setJustSurprised] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const autoSurpriseRef = useRef(false);

  const characterInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null && characterInputs.current[focusIndex]) {
      characterInputs.current[focusIndex]?.focus();
      characterInputs.current[focusIndex]?.select();
      setFocusIndex(null);
    }
  }, [characters, focusIndex]);

  const updateValue = useCallback((next: Partial<SetupFormState>) => {
    if (isLocked) return;
    onChange(next);
  }, [isLocked, onChange]);

  const handleCharacterChange = (index: number, charValue: string) => {
    const newChars = [...characters];
    newChars[index] = charValue;
    updateValue({ characters: newChars });
  };

  const addCharacter = () => {
    updateValue({ characters: [...characters, "New Character"] });
    setFocusIndex(characters.length);
  };

  const removeCharacter = (index: number) =>
    updateValue({ characters: characters.filter((_, i) => i !== index) });

  const checkSafety = useCallback(() => {
    if (
      premise.trim().length > 0 ||
      (characters.length > 0 &&
        (characters.length !== 2 ||
          characters[0] !== "Hero" ||
          characters[1] !== "Villain"))
    ) {
      return window.confirm(
        "This will overwrite your current premise and characters. Continue?"
      );
    }
    return true;
  }, [characters, premise]);

  const handleSurpriseMe = useCallback(async () => {
    if (isLocked) return;
    if (!checkSafety()) return;

    setIsSurprising(true);
    const targetGenre = genre;

    try {
      const data = await generateSurpriseSetup(targetGenre);
      updateValue({
        genre: data.genre,
        premise: data.premise,
        characters: data.characters,
      });

      setJustSurprised(true);
      setTimeout(() => setJustSurprised(false), 1500);
    } catch (e) {
      console.error("Surprise generation failed", e);
      const handled = onError?.(e, "Failed to generate a surprise setup.");
      if (handled) {
        return;
      }
      updateValue({
        premise: `A gripping ${targetGenre} story with unexpected twists.`,
        characters: ["Protagonist", "Antagonist", "The Catalyst"],
      });

      setJustSurprised(true);
      setTimeout(() => setJustSurprised(false), 1500);
    } finally {
      setIsSurprising(false);
    }
  }, [checkSafety, genre, isLocked, onError, updateValue]);

  const handlePillClick = (idea: string) => {
    if (isLocked) return;
    if (checkSafety()) {
      updateValue({ premise: idea });
    }
  };

  const handleEditSetup = () => {
    if (!onEditSetup) return;
    const proceed = window.confirm('Editing setup will clear the current draft and regenerate the script. Continue?');
    if (!proceed) return;
    onEditSetup();
  };

  useEffect(() => {
    if (!autoSurprise) {
      autoSurpriseRef.current = false;
      return;
    }
    if (autoSurpriseRef.current || isSurprising || isLocked) return;
    autoSurpriseRef.current = true;
    void handleSurpriseMe();
  }, [autoSurprise, handleSurpriseMe, isLocked, isSurprising]);

  const trimmedPremise = premise.trim();
  const premiseSnippet = trimmedPremise.length > 140
    ? `${trimmedPremise.slice(0, 140)}...`
    : trimmedPremise || 'No premise yet.';
  const castCount = characters.filter(char => char.trim().length > 0).length;
  const summaryParts = [genre, length, style.trim()].filter(Boolean);
  const summaryLine = summaryParts.join(' / ');
  const isStyleBlank = !style.trim();
  const isLengthBlank = !length;
  const lengthHint = (() => {
    if (isLengthBlank) {
      return 'Defaults to a balanced scene count.';
    }
    if (length === 'Short') {
      return 'Short aims for fewer scenes (roughly 1–2).';
    }
    if (length === 'Medium') {
      return 'Medium aims for a few scenes (roughly 3–5).';
    }
    return 'Long aims for more scenes (roughly 6+).';
  })();
  const isSummaryOnly = variant === "summary";
  const showSummary = isLocked || isSummaryOnly;
  const hasValidCharacter = characters.some(char => char.trim().length > 0);

  useEffect(() => {
    if (showAdvanced) return;
    if (style.trim() || (length && length !== "Medium")) {
      setShowAdvanced(true);
    }
  }, [length, showAdvanced, style]);

  return (
    <div className="space-y-4">
      {showSummary && (
        <div className="rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/10 space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">
              {summaryLine || 'Setup summary'}
            </p>
            <p className="text-xs text-slate-200">
              &quot;{premiseSnippet}&quot;
            </p>
            <p className="text-[11px] text-slate-400">Cast: {castCount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleEditSetup}
              disabled={!onEditSetup || isLoading}
              title="Edit setup and regenerate the script"
            >
              Edit setup (regenerates script)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearDraft}
              disabled={!onClearDraft || isLoading}
              title="Clear the current draft"
            >
              Clear draft
            </Button>
          </div>
        </div>
      )}

      {!isSummaryOnly && (
        <>
          <div className="rounded-2xl bg-slate-950/55 p-4 sm:p-5 ring-1 ring-white/10 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-[0.32em] text-slate-300">
                  Genre
                </label>
                <p className="text-xs text-slate-400">
                  Pick a genre, then let AI spin up a premise and cast.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={handleSurpriseMe}
                className="!bg-white/[0.03] hover:!bg-indigo-500/15 !border-white/20 hover:!border-indigo-400/60 !text-slate-200 transition-colors text-[11px] py-1.5 h-auto group"
                type="button"
                loading={isSurprising}
                disabled={isLoading || isSurprising || isLocked}
                size="sm"
                title="Randomly generate a genre, premise, and cast"
              >
                <Shuffle className="w-3 h-3 mr-2 opacity-80 group-hover:rotate-180 transition-transform duration-500" />
                Let AI Surprise Me
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => updateValue({ genre: g })}
                  disabled={isLocked}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ring-1 ${
                    genre === g
                      ? "bg-indigo-500/22 text-indigo-200 ring-indigo-300/55 shadow-[0_0_0_1px_rgba(129,140,248,0.35)_inset]"
                      : "bg-white/[0.03] text-slate-300 ring-white/15 hover:bg-white/[0.07] hover:text-white"
                  } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.12fr_0.88fr] gap-3">
            <div className="space-y-2 rounded-2xl bg-slate-950/50 p-4 ring-1 ring-white/10">
              <label className="text-xs font-bold uppercase tracking-[0.32em] text-slate-300">
                Premise
              </label>
              <textarea
                rows={4}
                value={premise}
                onChange={(e) => updateValue({ premise: e.target.value })}
                className={`w-full rounded-xl p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-none resize-none min-h-[98px] text-sm leading-relaxed ${
                  justSurprised
                    ? "bg-indigo-900/25 ring-1 ring-indigo-400/45 shadow-[0_0_18px_rgba(99,102,241,0.14)]"
                    : "bg-slate-900/75 ring-1 ring-white/10"
                } ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-900/60 text-slate-400" : ""}`}
                placeholder="e.g., A detective discovers his new partner is a ghost..."
                disabled={isLocked}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTER_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => handlePillClick(idea)}
                    disabled={isLocked}
                    className="w-full text-left text-[10px] text-slate-300 hover:text-indigo-100 bg-slate-900/65 hover:bg-indigo-500/20 rounded-full px-3 py-1.5 transition-colors cursor-pointer ring-1 ring-white/10 hover:ring-indigo-300/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-slate-950/50 p-4 ring-1 ring-white/10">
              <label className="text-xs font-bold uppercase tracking-[0.32em] text-slate-300 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-indigo-300" /> Characters
              </label>
              <div className="space-y-2">
                {characters.map((char, idx) => (
                  <div key={idx} className="relative group">
                    <input
                      ref={(el) => {
                        characterInputs.current[idx] = el;
                      }}
                      value={char}
                      onChange={(e) => handleCharacterChange(idx, e.target.value)}
                      className={`w-full rounded-xl p-2.5 pr-8 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 transition-all duration-700 ${
                        justSurprised
                          ? "bg-indigo-900/25 ring-1 ring-indigo-400/45"
                          : "bg-slate-900/80 ring-1 ring-white/10"
                      } ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-900/60 text-slate-400" : ""}`}
                      placeholder={`Character ${idx + 1}`}
                      disabled={isLocked}
                    />
                    {characters.length > 1 && !isLocked && (
                      <button
                        onClick={() => removeCharacter(idx)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        tabIndex={-1}
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
                  onClick={addCharacter}
                  disabled={isLocked}
                  className="w-full py-2 rounded-xl text-slate-300 hover:text-indigo-200 text-[11px] font-medium transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 ring-1 ring-dashed ring-white/20 hover:ring-indigo-300/55 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Character
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/45 ring-1 ring-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((open) => !open)}
              className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-[11px] uppercase tracking-[0.32em] text-slate-300">
                Advanced options (optional)
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 rounded-xl bg-indigo-500/[0.08] ring-1 ring-indigo-300/25 p-3.5">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase tracking-[0.32em] text-indigo-100">
                        Style (optional)
                      </label>
                      <p className="text-[11px] text-indigo-100/75">
                        Add a mood, tone, or pacing hint to make the output feel distinct.
                      </p>
                    </div>
                    <input
                      value={style}
                      onChange={(e) => updateValue({ style: e.target.value })}
                      className={`w-full rounded-lg p-2.5 text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${
                        justSurprised
                          ? "bg-indigo-900/20 ring-1 ring-indigo-500/55"
                          : "bg-slate-900/80 ring-1 ring-white/15"
                      } ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-900/60 text-slate-400" : ""}`}
                      placeholder="e.g., Witty noir with crisp dialogue"
                      disabled={isLocked}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {STYLE_SUGGESTIONS.map((tag) => {
                        const isSelected = style.trim().toLowerCase() === tag.toLowerCase();
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => updateValue({ style: tag })}
                            disabled={isLocked}
                            className={`text-[10px] px-2 py-1 rounded-full ring-1 transition-colors ${
                              isSelected
                                ? "text-indigo-100 bg-indigo-500/28 ring-indigo-100/50"
                                : "text-indigo-100/85 bg-indigo-500/16 ring-indigo-200/30 hover:bg-indigo-500/24 hover:ring-indigo-100/40"
                            } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                            title={`Use style: ${tag}`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    {isStyleBlank && (
                      <p className="text-[10px] text-slate-400">Using defaults.</p>
                    )}
                  </div>

                  <div className="space-y-1.5 rounded-xl bg-slate-900/55 ring-1 ring-white/10 p-3.5">
                    <label className="text-xs font-bold uppercase tracking-[0.32em] text-slate-300">
                      Target Length (optional)
                    </label>
                    <select
                      value={length}
                      onChange={(e) => updateValue({ length: e.target.value })}
                      className={`w-full rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        justSurprised
                          ? "bg-indigo-900/20 ring-1 ring-indigo-500/55"
                          : "bg-slate-900/80 ring-1 ring-white/15"
                      } ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-900/60 text-slate-400" : ""}`}
                      disabled={isLocked}
                    >
                      <option value="">Balanced (default)</option>
                      {LENGTH_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">{lengthHint}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {showSubmit && onStart && (
            <Button
              variant="primary"
              onClick={onStart}
              className="w-full shadow-[0_14px_40px_rgba(99,102,241,0.3)] hover:shadow-[0_18px_52px_rgba(99,102,241,0.42)] !bg-indigo-600 hover:!bg-indigo-500 transition-all text-sm font-medium"
              loading={isLoading}
              size="lg"
              disabled={!premise.trim() || !hasValidCharacter || isLoading || isSurprising || isLocked}
              title="Generate your opening scene"
            >
              Generate First Scene
            </Button>
          )}
        </>
      )}
    </div>
  );
};
