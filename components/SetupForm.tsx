import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Users, Plus, Search, Trash2, X } from "lucide-react";
import { STYLE_CATEGORIES, stylesLibrary } from "../stylesLibrary";

export type SetupFormState = {
  genre: string;
  premise: string;
  characters: string[];
  style: string;
  length: string;
};

export interface SetupFormProps {
  value: SetupFormState;
  onChange: (
    next: Partial<SetupFormState>,
    meta?: { source?: "user" | "system" },
  ) => void;
  onRequestSurprise?: (params: {
    mode: "manual" | "auto";
    targetGenre: string;
  }) => Promise<boolean>;
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

export const STYLE_PRESETS = [
  "Dry humor",
  "Dark humor",
  "Puns",
  "Unhinged",
  "Infomercial",
  "Transatlantic dialogue",
  "All dialogue rhymes",
  "Characters can't hear each other (constant misunderstandings)",
  "Everyone speaks in Gen Z slang",
  "Dead serious documentary tone",
];

const normalizeStyleValue = (value: string) => value.trim().toLowerCase();

export const SetupForm: React.FC<SetupFormProps> = ({
  value,
  onChange,
  onRequestSurprise,
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
  const [showDetails, setShowDetails] = useState(false);
  const [pendingDetailReveal, setPendingDetailReveal] = useState(false);
  const [detailRevealSource, setDetailRevealSource] = useState<
    "manual" | "ai" | null
  >(null);
  const [styleSearch, setStyleSearch] = useState("");
  const [isStyleLibraryOpen, setIsStyleLibraryOpen] = useState(false);
  const autoSurpriseRef = useRef(false);
  const styleRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const styleLibrarySearchInputRef = useRef<HTMLInputElement | null>(null);

  const characterInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null && characterInputs.current[focusIndex]) {
      characterInputs.current[focusIndex]?.focus();
      characterInputs.current[focusIndex]?.select();
      setFocusIndex(null);
    }
  }, [characters, focusIndex]);

  const updateValue = useCallback(
    (next: Partial<SetupFormState>, source: "user" | "system" = "user") => {
      if (isLocked) return;
      onChange(next, { source });
    },
    [isLocked, onChange],
  );

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
        "This will overwrite your current premise and characters. Continue?",
      );
    }
    return true;
  }, [characters, premise]);

  const handleSurpriseMe = useCallback(
    async (mode: "manual" | "auto") => {
      if (isLocked) return;
      if (!checkSafety()) return;

      setIsSurprising(true);
      const targetGenre = genre;

      try {
        let committed = false;
        if (onRequestSurprise) {
          committed = await onRequestSurprise({ mode, targetGenre });
        } else {
          updateValue(
            {
              premise: `A gripping ${targetGenre} story with unexpected twists.`,
              characters: ["Protagonist", "Antagonist", "The Catalyst"],
            },
            "system",
          );
          committed = true;
        }

        if (!committed) {
          return;
        }

        if (showDetails) {
          setDetailRevealSource("ai");
        } else {
          setPendingDetailReveal(true);
        }
        setJustSurprised(true);
        setTimeout(() => setJustSurprised(false), 1500);
      } catch (e) {
        console.error("Surprise generation failed", e);
        const handled = onError?.(e, "Failed to generate a surprise setup.");
        if (handled) {
          return;
        }
        updateValue(
          {
            premise: `A gripping ${targetGenre} story with unexpected twists.`,
            characters: ["Protagonist", "Antagonist", "The Catalyst"],
          },
          "system",
        );

        if (showDetails) {
          setDetailRevealSource("ai");
        } else {
          setPendingDetailReveal(true);
        }
        setJustSurprised(true);
        setTimeout(() => setJustSurprised(false), 1500);
      } finally {
        setIsSurprising(false);
      }
    },
    [
      checkSafety,
      genre,
      isLocked,
      onError,
      onRequestSurprise,
      showDetails,
      updateValue,
    ],
  );

  const handlePillClick = (idea: string) => {
    if (isLocked) return;
    if (checkSafety()) {
      updateValue({ premise: idea });
    }
  };

  const handleEditSetup = () => {
    if (!onEditSetup) return;
    const proceed = window.confirm(
      "Editing setup will clear the current draft and regenerate the script. Continue?",
    );
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
    void handleSurpriseMe("auto");
  }, [autoSurprise, handleSurpriseMe, isLocked, isSurprising]);

  useEffect(() => {
    if (!pendingDetailReveal) return;
    const hasPremise = premise.trim().length > 0;
    const hasCharacter = characters.some((char) => char.trim().length > 0);
    if (!hasPremise || !hasCharacter) return;
    setShowDetails(true);
    setDetailRevealSource("ai");
    setPendingDetailReveal(false);
  }, [characters, pendingDetailReveal, premise]);
  useEffect(() => {
    if (!isStyleLibraryOpen) return;
    const animationId = requestAnimationFrame(() => {
      styleLibrarySearchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(animationId);
  }, [isStyleLibraryOpen]);
  useEffect(() => {
    if (!isStyleLibraryOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStyleLibraryOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isStyleLibraryOpen]);

  const trimmedPremise = premise.trim();
  const normalizedStyleSearch = styleSearch.trim().toLowerCase();
  const normalizedStyle = normalizeStyleValue(style);
  const filteredStyles = useMemo(() => {
    if (!normalizedStyleSearch) return stylesLibrary;
    return stylesLibrary.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalizedStyleSearch) ||
        item.description.toLowerCase().includes(normalizedStyleSearch)
      );
    });
  }, [normalizedStyleSearch]);
  const groupedFilteredStyles = useMemo(
    () =>
      STYLE_CATEGORIES.map((category) => ({
        ...category,
        items: filteredStyles.filter((item) => item.category === category.id),
      })).filter((group) => group.items.length > 0),
    [filteredStyles],
  );
  const selectedLibraryStyle = useMemo(
    () =>
      stylesLibrary.find(
        (item) => normalizeStyleValue(item.title) === normalizedStyle,
      ) ?? null,
    [normalizedStyle],
  );
  const selectedStyleCategoryLabel = useMemo(() => {
    if (!selectedLibraryStyle) return null;
    return (
      STYLE_CATEGORIES.find(
        (category) => category.id === selectedLibraryStyle.category,
      )?.label ?? null
    );
  }, [selectedLibraryStyle]);
  useEffect(() => {
    if (!isStyleLibraryOpen) return;
    if (!selectedLibraryStyle) return;
    const isVisibleInFilteredStyles = filteredStyles.some(
      (item) => item.id === selectedLibraryStyle.id,
    );
    if (!isVisibleInFilteredStyles) return;
    const selectedButton = styleRowRefs.current[selectedLibraryStyle.id];
    if (
      !selectedButton ||
      typeof selectedButton.scrollIntoView !== "function"
    ) {
      return;
    }
    selectedButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [filteredStyles, isStyleLibraryOpen, selectedLibraryStyle]);
  const handleStyleShuffle = useCallback(() => {
    if (isLocked || stylesLibrary.length === 0) return;
    const randomIndex = Math.floor(Math.random() * stylesLibrary.length);
    const randomStyle = stylesLibrary[randomIndex];
    if (!randomStyle) return;
    updateValue({ style: randomStyle.title });
  }, [isLocked, updateValue]);
  const handleSelectStyleFromLibrary = useCallback(
    (nextStyle: string) => {
      updateValue({ style: nextStyle });
      setIsStyleLibraryOpen(false);
    },
    [updateValue],
  );
  const handleClearStyle = useCallback(() => {
    updateValue({ style: "" });
  }, [updateValue]);
  const premiseSnippet =
    trimmedPremise.length > 140
      ? `${trimmedPremise.slice(0, 140)}...`
      : trimmedPremise || "No premise yet.";
  const castCount = characters.filter((char) => char.trim().length > 0).length;
  const summaryParts = [genre, length, style.trim()].filter(Boolean);
  const summaryLine = summaryParts.join(" / ");
  const isStyleBlank = !style.trim();
  const isSummaryOnly = variant === "summary";
  const showSummary = isLocked || isSummaryOnly;
  const hasValidCharacter = characters.some((char) => char.trim().length > 0);

  return (
    <div className="space-y-4">
      {showSummary && (
        <div className="rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/10 space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">
              {summaryLine || "Setup summary"}
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

          <div className="space-y-2 rounded-2xl bg-indigo-500/[0.08] ring-1 ring-indigo-300/25 p-4 sm:p-5">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-[0.32em] text-indigo-100">
                Style
              </label>
              <p className="text-[11px] text-indigo-100/75">
                Pick a vibe from the library. This sets tone for future
                generations.
              </p>
            </div>
            <div className="space-y-2">
              <div
                className="rounded-xl bg-slate-950/65 ring-1 ring-indigo-200/25 p-3 space-y-2"
                aria-live="polite"
              >
                <p className="text-[10px] uppercase tracking-[0.24em] text-indigo-100/70">
                  Selected style
                </p>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-indigo-100">
                      {selectedLibraryStyle?.title ??
                        (isStyleBlank ? "None (default style)" : style.trim())}
                    </p>
                    {selectedStyleCategoryLabel && (
                      <span className="rounded-full bg-indigo-500/20 ring-1 ring-indigo-200/45 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-indigo-100/85">
                        {selectedStyleCategoryLabel}
                      </span>
                    )}
                  </div>
                  {!isStyleBlank && (
                    <div className="ml-auto w-full sm:w-auto flex justify-end">
                      <button
                        type="button"
                        onClick={handleClearStyle}
                        disabled={isLocked}
                        className={`text-[11px] font-medium text-indigo-100/75 transition-opacity hover:opacity-100 hover:underline ${
                          isLocked ? "opacity-60 cursor-not-allowed" : "opacity-90"
                        }`}
                        title="Clear selected style"
                      >
                        × Clear
                      </button>
                    </div>
                  )}
                </div>
                {selectedLibraryStyle ? (
                  <>
                    <p className="text-[11px] text-indigo-100/75">
                      {selectedLibraryStyle.description}
                    </p>
                    <p className="text-[11px] text-indigo-100/85 leading-snug">
                      <span className="font-semibold text-indigo-100">
                        Sample line:
                      </span>{" "}
                      {selectedLibraryStyle.sampleLine}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-indigo-100/75">
                    {isStyleBlank
                      ? "Using default tone settings."
                      : "Custom style selected."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleStyleShuffle}
                    disabled={isLocked || stylesLibrary.length === 0}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ring-1 transition-colors ${
                      isLocked || stylesLibrary.length === 0
                        ? "opacity-60 cursor-not-allowed text-indigo-100/70 bg-indigo-500/10 ring-indigo-200/25"
                        : "text-indigo-100 bg-indigo-500/20 ring-indigo-200/40 hover:bg-indigo-500/30 hover:ring-indigo-100/55"
                    }`}
                  >
                    Shuffle
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsStyleLibraryOpen(true)}
                    disabled={isLocked}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ring-1 transition-colors ${
                      isLocked
                        ? "opacity-60 cursor-not-allowed text-indigo-100/70 bg-indigo-500/10 ring-indigo-200/25"
                        : "text-indigo-100 bg-indigo-500/20 ring-indigo-200/40 hover:bg-indigo-500/30 hover:ring-indigo-100/55"
                    }`}
                    aria-haspopup="dialog"
                    aria-expanded={isStyleLibraryOpen}
                  >
                    <Search className="h-3.5 w-3.5" />
                    Browse
                  </button>
                </div>
              </div>
            </div>
          </div>
          {isStyleLibraryOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setIsStyleLibraryOpen(false)}
              />
              <div
                className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-indigo-300/20 bg-slate-950 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-label="Style Library"
              >
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-indigo-100/60">
                      Style
                    </p>
                    <h2 className="text-sm font-semibold text-indigo-100">
                      Style Library
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsStyleLibraryOpen(false)}
                    className="rounded-lg p-1.5 text-indigo-100/80 hover:text-indigo-100 hover:bg-indigo-500/20 transition-colors"
                    aria-label="Close style library"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3 p-4">
                  <input
                    ref={styleLibrarySearchInputRef}
                    value={styleSearch}
                    onChange={(event) => setStyleSearch(event.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-indigo-100/55 bg-slate-900/70 ring-1 ring-indigo-200/25 focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    placeholder="Search styles..."
                    aria-label="Search styles"
                    disabled={isLocked}
                  />
                  <div className="max-h-[58vh] overflow-y-auto rounded-xl bg-slate-950/70 ring-1 ring-white/10">
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => handleSelectStyleFromLibrary("")}
                        disabled={isLocked}
                        aria-pressed={isStyleBlank}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-colors ring-1 ${
                          isStyleBlank
                            ? "bg-indigo-500/30 ring-indigo-100/55 text-indigo-100"
                            : "bg-white/[0.02] ring-white/10 text-slate-200 hover:bg-white/[0.06] hover:text-white"
                        } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                        title="Use no style"
                      >
                        None (no style)
                      </button>
                    </div>
                    {groupedFilteredStyles.length > 0 ? (
                      groupedFilteredStyles.map((group) => (
                        <div
                          key={group.id}
                          className="border-t border-white/10 px-2 py-2 space-y-1.5"
                        >
                          <p className="px-2 text-[10px] uppercase tracking-[0.26em] text-indigo-100/50">
                            {group.label}
                          </p>
                          {group.items.map((item) => {
                            const isSelected =
                              normalizedStyle === normalizeStyleValue(item.title);
                            return (
                              <button
                                key={item.id}
                                ref={(element) => {
                                  styleRowRefs.current[item.id] = element;
                                }}
                                type="button"
                                onClick={() =>
                                  handleSelectStyleFromLibrary(item.title)
                                }
                                disabled={isLocked}
                                aria-pressed={isSelected}
                                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ring-1 ${
                                  isSelected
                                    ? "bg-indigo-500/30 ring-indigo-100/55 text-indigo-100"
                                    : "bg-white/[0.02] ring-white/10 text-slate-200 hover:bg-white/[0.06] hover:text-white"
                                } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                                title={`Use style: ${item.title}`}
                              >
                                <p className="text-xs font-semibold">
                                  {item.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-indigo-100/75">
                                  {item.description}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      ))
                    ) : (
                      <p className="px-4 py-4 text-xs text-slate-300">
                        No styles match your search.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                void handleSurpriseMe("manual");
              }}
              className="w-full py-4 uppercase tracking-[0.2em] text-xs font-bold !bg-indigo-500/15 hover:!bg-indigo-500/25 !border-indigo-500/30 text-indigo-100 transition-all text-center rounded-xl"
              type="button"
              loading={isSurprising}
              disabled={isLoading || isSurprising || isLocked}
            >
              Generate AI Premise
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPendingDetailReveal(false);
                setShowDetails(true);
                setDetailRevealSource("manual");
              }}
              className="w-full py-4 uppercase tracking-[0.2em] text-xs font-bold !bg-slate-800/50 hover:!bg-slate-700/50 !border-white/10 text-slate-300 transition-all text-center rounded-xl"
              type="button"
              disabled={isLocked}
            >
              Write My Own Premise
            </Button>
          </div>

          {showDetails && (
            <div className="space-y-4 pt-2">
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
                  {detailRevealSource === "manual" && (
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
                  )}
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
                          onChange={(e) =>
                            handleCharacterChange(idx, e.target.value)
                          }
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

              <div className="space-y-6 pt-6 pb-2">
                <div className="text-center">
                  <label className="text-xs font-bold uppercase tracking-[0.32em] text-slate-300 block mb-6">
                    Target Scene Length
                  </label>
                  <div className="relative w-full max-w-md mx-auto h-[2px] bg-slate-700/80 rounded-full flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      value={length === "Short" ? 0 : length === "Long" ? 2 : 1}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "0") updateValue({ length: "Short" });
                        else if (val === "2") updateValue({ length: "Long" });
                        else updateValue({ length: "Medium" });
                      }}
                      className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
                      aria-label="Scene length"
                      disabled={isLocked}
                      title="Target Scene Length"
                    />
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-0">
                      <div className="w-[3px] h-3.5 rounded-full bg-slate-700/80" />
                      <div className="w-[3px] h-3.5 rounded-full bg-slate-700/80" />
                      <div className="w-[3px] h-3.5 rounded-full bg-slate-700/80" />
                    </div>
                    <div
                      className="absolute w-5 h-5 bg-indigo-500 rounded-full top-1/2 -translate-y-1/2 z-0 shadow-[0_0_12px_rgba(99,102,241,0.6)] transition-all duration-300 border-2 border-slate-900"
                      style={{
                        left: `calc(${(length === "Short" ? 0 : length === "Long" ? 2 : 1) * 50}% - 10px)`,
                      }}
                    />
                  </div>
                  <div className="relative w-full max-w-md mx-auto flex justify-between mt-3 text-[10px] font-bold text-slate-400">
                    <span
                      className={
                        length === "Short" ? "text-indigo-300" : "opacity-60"
                      }
                    >
                      SHORT
                    </span>
                    <span
                      className={
                        !length || length === "Medium"
                          ? "text-indigo-300"
                          : "opacity-60"
                      }
                    >
                      MEDIUM
                    </span>
                    <span
                      className={
                        length === "Long" ? "text-indigo-300" : "opacity-60"
                      }
                    >
                      LONG
                    </span>
                  </div>
                </div>
              </div>

              {showSubmit && onStart && (
                <Button
                  variant="primary"
                  onClick={onStart}
                  className="w-full shadow-[0_14px_40px_rgba(99,102,241,0.3)] hover:shadow-[0_18px_52px_rgba(99,102,241,0.42)] !bg-indigo-600 hover:!bg-indigo-500 transition-all text-sm font-medium mt-4 py-3.5"
                  loading={isLoading}
                  size="lg"
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
          )}
        </>
      )}
    </div>
  );
};
