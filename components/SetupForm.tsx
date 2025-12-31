import React, { useState, useRef, useEffect } from "react";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Sparkles, Users, BookOpen, Plus, Trash2, Shuffle } from "lucide-react";
import { generateSurpriseSetup } from "../services/gemini";

interface SetupFormProps {
  onStart: (data: {
    genre: string;
    premise: string;
    characters: string[];
  }) => void;
  isLoading: boolean;
}

const STARTER_IDEAS = [
  "Two rivals are forced to work together",
  "A secret threatens to unravel everything",
  "A normal day goes very wrong",
];

export const SetupForm: React.FC<SetupFormProps> = ({ onStart, isLoading }) => {
  const [genre, setGenre] = useState(GENRES[0]);
  const [premise, setPremise] = useState("");
  const [characters, setCharacters] = useState(["Hero", "Villain"]);

  // Surprise State
  const [isSurprising, setIsSurprising] = useState(false);
  const [justSurprised, setJustSurprised] = useState(false);

  // Refs for managing focus on new inputs
  const characterInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null && characterInputs.current[focusIndex]) {
      characterInputs.current[focusIndex]?.focus();
      characterInputs.current[focusIndex]?.select();
      setFocusIndex(null);
    }
  }, [characters, focusIndex]);

  const handleCharacterChange = (index: number, value: string) => {
    const newChars = [...characters];
    newChars[index] = value;
    setCharacters(newChars);
  };

  const addCharacter = () => {
    setCharacters([...characters, "New Character"]);
    setFocusIndex(characters.length);
  };

  const removeCharacter = (index: number) =>
    setCharacters(characters.filter((_, i) => i !== index));

  const checkSafety = () => {
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
  };

  const handleSurpriseMe = async () => {
    if (!checkSafety()) return;

    setIsSurprising(true);
    const targetGenre = genre; // Capture current genre

    try {
      const data = await generateSurpriseSetup(targetGenre);

      // Update form directly (non-blocking)
      setGenre(data.genre);
      setPremise(data.premise);
      setCharacters(data.characters);
      // Update form directly (non-blocking)
      setGenre(data.genre);
      setPremise(data.premise);
      setCharacters(data.characters);

      // Trigger visual feedback
      setJustSurprised(true);
      setTimeout(() => setJustSurprised(false), 1500);
    } catch (e) {
      console.error("Surprise generation failed", e);
      // Fallback
      setPremise(`A gripping ${targetGenre} story with unexpected twists.`);
      setCharacters(["Protagonist", "Antagonist", "The Catalyst"]);

      setJustSurprised(true);
      setTimeout(() => setJustSurprised(false), 1500);
    } finally {
      setIsSurprising(false);
    }
  };

  const handlePillClick = (idea: string) => {
    if (checkSafety()) {
      setPremise(idea);
    }
  };

  return (
    <div className="h-screen w-full bg-gray-900 overflow-hidden flex flex-col p-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-indigo-500" />
          Script Seance
        </h1>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-6">
        {/* Row 1: Genre (Full Width) */}
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-lg font-semibold text-gray-200">
              Genre
            </label>
            <Button
              variant="secondary"
              onClick={handleSurpriseMe}
              className="!bg-transparent hover:!bg-slate-800 !border-slate-700 hover:!border-indigo-500 border !text-gray-400 hover:!text-indigo-400 transition-colors text-xs py-1.5 h-auto group"
              type="button"
              loading={isSurprising}
              disabled={isLoading || isSurprising}
              size="sm"
              title="Generate a random setup"
            >
              <Shuffle className="w-3.5 h-3.5 mr-2 opacity-75 group-hover:rotate-180 transition-transform duration-500" />
              Magic Shuffle
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-all border ${
                  genre === g
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm"
                    : "bg-gray-800/40 text-gray-500 border-gray-700/50 hover:bg-gray-800 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Split Columns */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
          {/* Col 1: Premise */}
          <div className="flex flex-col min-h-0">
            <label className="block text-lg font-semibold text-gray-200 mb-3">
              Premise
            </label>
            <textarea
              rows={3}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              className={`w-full rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-700 resize-y min-h-[80px] text-sm leading-relaxed ${
                justSurprised
                  ? "bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                  : "bg-gray-800 border-gray-700"
              }`}
              placeholder="e.g., A detective discovers his new partner is a ghost..."
            />
            <div className="flex flex-wrap gap-2 mt-3 shrink-0">
              {STARTER_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => handlePillClick(idea)}
                  className="text-xs text-gray-500 hover:text-indigo-400 bg-gray-800/40 hover:bg-gray-800 border border-gray-700/30 hover:border-indigo-500 rounded-full px-3 py-1 transition-colors cursor-pointer"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          {/* Col 2: Characters */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="mb-3 shrink-0">
              <label className="block text-lg font-semibold text-gray-200 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" /> Characters
              </label>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
              {characters.map((char, idx) => (
                <div key={idx} className="relative group">
                  <input
                    ref={(el) => {
                      characterInputs.current[idx] = el;
                    }}
                    value={char}
                    onChange={(e) => handleCharacterChange(idx, e.target.value)}
                    className={`w-full rounded-lg p-3 pr-8 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-600 transition-all duration-700 ${
                      justSurprised
                        ? "bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50"
                        : "bg-gray-800 border-gray-700"
                    }`}
                    placeholder={`Character ${idx + 1}`}
                  />
                  {characters.length > 1 && (
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
                className="w-full py-2 border border-gray-700 border-dashed rounded-lg text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 text-xs font-medium transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                <Plus className="w-3.5 h-3.5" /> Add Character
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="mt-6 pt-6 border-t border-gray-800 shrink-0">
        <Button
          variant="primary"
          onClick={() => onStart({ genre, premise, characters })}
          className="w-full shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] !bg-indigo-600 hover:!bg-indigo-500 border border-indigo-500/50 transition-all transform hover:-translate-y-0.5 text-sm font-medium"
          loading={isLoading}
          size="lg"
          disabled={!premise.trim() || isLoading || isSurprising}
        >
          Start Writing
        </Button>
      </div>
    </div>
  );
};
