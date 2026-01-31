import React, { useState, useRef, useEffect, useCallback } from "react";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Users, Plus, Trash2, Shuffle } from "lucide-react";
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
];

const LENGTH_OPTIONS = ["Short", "Medium", "Long"];

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
  const isSummaryOnly = variant === "summary";
  const showSummary = isLocked || isSummaryOnly;

  return (
    <div className="space-y-6">
      {showSummary && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              {summaryLine || 'Setup summary'}
            </p>
            <p className="text-xs text-gray-300">
              &quot;{premiseSnippet}&quot;
            </p>
            <p className="text-[11px] text-gray-500">Cast: {castCount}</p>
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Genre
              </label>
              <Button
                variant="secondary"
                onClick={handleSurpriseMe}
                className="!bg-transparent hover:!bg-slate-800 !border-slate-700 hover:!border-indigo-500 border !text-gray-400 hover:!text-indigo-400 transition-colors text-[11px] py-1 h-auto group"
                type="button"
                loading={isSurprising}
                disabled={isLoading || isSurprising || isLocked}
                size="sm"
                title="Randomly generate a genre, premise, and cast"
              >
                <Shuffle className="w-3 h-3 mr-2 opacity-75 group-hover:rotate-180 transition-transform duration-500" />
                Surprise Me
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => updateValue({ genre: g })}
                  disabled={isLocked}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                    genre === g
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm"
                      : "bg-gray-800/40 text-gray-500 border-gray-700/50 hover:bg-gray-800 hover:text-gray-300 hover:border-gray-600"
                  } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Premise
              </label>
              <textarea
                rows={3}
                value={premise}
                onChange={(e) => updateValue({ premise: e.target.value })}
                className={`w-full rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-none resize-y min-h-[80px] text-sm leading-relaxed ${
                  justSurprised
                    ? "bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                    : "bg-gray-800 border-gray-700"
                } ${isLocked ? "opacity-60 cursor-not-allowed bg-gray-900/60 border-gray-800 text-gray-400" : ""}`}
                placeholder="e.g., A detective discovers his new partner is a ghost..."
                disabled={isLocked}
              />
              <div className="flex flex-wrap gap-2">
                {STARTER_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => handlePillClick(idea)}
                    disabled={isLocked}
                    className="text-[10px] text-gray-500 hover:text-indigo-400 bg-gray-800/40 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500 rounded-full px-3 py-1 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Style (optional)
                </label>
                <input
                  value={style}
                  onChange={(e) => updateValue({ style: e.target.value })}
                  className={`w-full rounded-lg p-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${
                    justSurprised
                      ? "bg-indigo-900/20 border-indigo-500"
                      : "bg-gray-800 border-gray-700"
                  } ${isLocked ? "opacity-60 cursor-not-allowed bg-gray-900/60 border-gray-800 text-gray-400" : ""}`}
                  placeholder="e.g., Witty noir with crisp dialogue"
                  disabled={isLocked}
                />
                {isStyleBlank && (
                  <p className="text-[10px] text-gray-500">Using defaults.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Length (optional)
                </label>
                <select
                  value={length}
                  onChange={(e) => updateValue({ length: e.target.value })}
                  className={`w-full rounded-lg p-2.5 text-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    justSurprised
                      ? "bg-indigo-900/20 border-indigo-500"
                      : "bg-gray-800 border-gray-700"
                  } ${isLocked ? "opacity-60 cursor-not-allowed bg-gray-900/60 border-gray-800 text-gray-400" : ""}`}
                  disabled={isLocked}
                >
                  <option value="">Using defaults</option>
                  {LENGTH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500">
                  {isLengthBlank ? "Using defaults." : "Length influences pacing, not format."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> Characters
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
                    className={`w-full rounded-lg p-2.5 pr-8 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-600 transition-all duration-700 ${
                      justSurprised
                        ? "bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50"
                        : "bg-gray-800 border-gray-700"
                    } ${isLocked ? "opacity-60 cursor-not-allowed bg-gray-900/60 border-gray-800 text-gray-400" : ""}`}
                    placeholder={`Character ${idx + 1}`}
                    disabled={isLocked}
                  />
                  {characters.length > 1 && !isLocked && (
                    <button
                      onClick={() => removeCharacter(idx)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
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
                className="w-full py-2 border border-gray-700 border-dashed rounded-lg text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 text-[11px] font-medium transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" /> Add Character
              </button>
            </div>
          </div>

          {showSubmit && onStart && (
            <Button
              variant="primary"
              onClick={onStart}
              className="w-full shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] !bg-indigo-600 hover:!bg-indigo-500 border border-indigo-500/50 transition-all text-sm font-medium"
              loading={isLoading}
              size="lg"
              disabled={!premise.trim() || isLoading || isSurprising || isLocked}
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
