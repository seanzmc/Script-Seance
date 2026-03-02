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
  styleId?: string | null;
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

export const SETUP_UI_TOKENS = {
  title: "text-xl sm:text-2xl md:text-[26px] font-semibold tracking-tight text-white",
  subtitle: "text-sm sm:text-base leading-relaxed text-slate-300/80",
  sectionLabel:
    "text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-slate-300",
  bodyText: "text-sm sm:text-base leading-relaxed text-slate-300",
  bodyMutedText: "text-sm sm:text-base leading-relaxed text-slate-400",
  panelSurface: "rounded-xl bg-white/[0.02]",
  buttonText: "text-sm font-semibold uppercase tracking-[0.2em]",
  metaText: "text-xs sm:text-sm text-slate-400",
} as const;

type SceneLengthValue = "Short" | "Medium" | "Long";
type LengthTickPhase = "idle" | "prep" | "animate";

const normalizeLengthValue = (value: string): SceneLengthValue =>
  value === "Short" || value === "Long" ? value : "Medium";

const getNextLengthValue = (value: SceneLengthValue): SceneLengthValue =>
  value === "Short" ? "Medium" : value === "Medium" ? "Long" : "Short";

type LengthCycleWheelProps = {
  value: SceneLengthValue;
  disabled?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: SceneLengthValue) => void;
};

const LENGTH_TICK_DURATION_MS = 240;

const LengthCycleWheel: React.FC<LengthCycleWheelProps> = ({
  value,
  disabled = false,
  prefersReducedMotion,
  focusRingClass,
  onChange,
}) => {
  const [currentValue, setCurrentValue] = useState<SceneLengthValue>(value);
  const [nextValue, setNextValue] = useState<SceneLengthValue | null>(null);
  const [phase, setPhase] = useState<LengthTickPhase>("idle");
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const clearScheduledAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearScheduledAnimation();
    };
  }, [clearScheduledAnimation]);

  useEffect(() => {
    if (phase !== "idle") return;
    if (currentValue === value) return;
    setCurrentValue(value);
  }, [currentValue, phase, value]);

  useEffect(() => {
    if (!prefersReducedMotion || phase === "idle" || nextValue === null) return;
    clearScheduledAnimation();
    setCurrentValue(nextValue);
    setNextValue(null);
    setPhase("idle");
  }, [clearScheduledAnimation, nextValue, phase, prefersReducedMotion]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    const baseValue = nextValue ?? currentValue;
    const nextLength = getNextLengthValue(baseValue);
    onChange(nextLength);

    if (prefersReducedMotion) {
      clearScheduledAnimation();
      setCurrentValue(nextLength);
      setNextValue(null);
      setPhase("idle");
      return;
    }

    clearScheduledAnimation();
    setNextValue(nextLength);
    setPhase("prep");

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setPhase("animate");
    });

    timeoutRef.current = window.setTimeout(() => {
      setCurrentValue(nextLength);
      setNextValue(null);
      setPhase("idle");
      timeoutRef.current = null;
    }, LENGTH_TICK_DURATION_MS);
  }, [
    clearScheduledAnimation,
    currentValue,
    disabled,
    nextValue,
    onChange,
    prefersReducedMotion,
  ]);

  const isAnimating = !prefersReducedMotion && phase !== "idle" && nextValue !== null;
  const incomingValue = nextValue ?? currentValue;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`rounded-sm px-1.5 py-0.5 text-slate-200 transition-[opacity,transform] duration-[220ms] ease-out hover:text-indigo-100 hover:-translate-y-px active:translate-y-px ${focusRingClass} ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
      aria-label="Cycle scene length"
      title="Cycle target scene length"
    >
      <span
        className="relative inline-flex h-[2.1em] w-[7ch] overflow-hidden align-middle text-left"
        data-testid="setup-length-value-viewport"
      >
        {isAnimating && (
          <span
            className={`absolute inset-0 flex items-center leading-[1.3] transition-[opacity,transform] duration-[240ms] ease-in-out ${
              phase === "animate" ? "-translate-y-[6px] opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            {currentValue}
          </span>
        )}
        <span
          data-testid="setup-length-value"
          className={`absolute inset-0 flex items-center leading-[1.3] ${
            isAnimating
              ? `transition-[opacity,transform] duration-[240ms] ${
                  phase === "animate"
                    ? "translate-y-0 opacity-100 ease-in-out"
                    : "translate-y-[6px] opacity-0 ease-in-out"
                }`
              : "opacity-100"
          }`}
        >
          {incomingValue}
        </span>
      </span>
    </button>
  );
};

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
  const { genre, premise, characters, style, styleId, length } = value;
  const [isSurprising, setIsSurprising] = useState(false);
  const [justSurprised, setJustSurprised] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pendingDetailReveal, setPendingDetailReveal] = useState(false);
  const [detailRevealSource, setDetailRevealSource] = useState<
    "manual" | "ai" | null
  >(null);
  const [styleSearch, setStyleSearch] = useState("");
  const [isStyleLibraryOpen, setIsStyleLibraryOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [styleShufflePulse, setStyleShufflePulse] = useState(false);
  const autoSurpriseRef = useRef(false);
  const styleRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const styleLibrarySearchInputRef = useRef<HTMLInputElement | null>(null);
  const styleLibraryModalRef = useRef<HTMLDivElement | null>(null);
  const styleShufflePulseTimeoutRef = useRef<number | null>(null);

  const characterInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const setupUi = SETUP_UI_TOKENS;

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

  const confirmSetupOverwrite = useCallback(() => {
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

  const applyFallbackSurpriseSetup = useCallback(
    (targetGenre: string) => {
      updateValue(
        {
          premise: `A gripping ${targetGenre} story with unexpected twists.`,
          characters: ["Protagonist", "Antagonist", "The Catalyst"],
        },
        "system",
      );
    },
    [updateValue],
  );

  const revealAiDetails = useCallback(() => {
    if (showDetails) {
      setDetailRevealSource("ai");
    } else {
      setPendingDetailReveal(true);
    }
  }, [showDetails]);

  const triggerSurpriseHighlight = useCallback(() => {
    setJustSurprised(true);
    setTimeout(() => setJustSurprised(false), 1500);
  }, []);

  const handleGenerateSurpriseSetup = useCallback(
    async (mode: "manual" | "auto") => {
      if (isLocked) return;
      if (!confirmSetupOverwrite()) return;

      setIsSurprising(true);
      const targetGenre = genre;

      try {
        let committed = false;
        if (onRequestSurprise) {
          committed = await onRequestSurprise({ mode, targetGenre });
        } else {
          applyFallbackSurpriseSetup(targetGenre);
          committed = true;
        }

        if (!committed) {
          return;
        }

        revealAiDetails();
        triggerSurpriseHighlight();
      } catch (e) {
        console.error("Surprise generation failed", e);
        const handled = onError?.(e, "Failed to generate a surprise setup.");
        if (handled) {
          return;
        }
        applyFallbackSurpriseSetup(targetGenre);
        revealAiDetails();
        triggerSurpriseHighlight();
      } finally {
        setIsSurprising(false);
      }
    },
    [
      applyFallbackSurpriseSetup,
      confirmSetupOverwrite,
      genre,
      isLocked,
      onError,
      onRequestSurprise,
      revealAiDetails,
      triggerSurpriseHighlight,
    ],
  );

  const handleStarterIdeaClick = (idea: string) => {
    if (isLocked) return;
    if (confirmSetupOverwrite()) {
      updateValue({ premise: idea });
    }
  };

  const showManualDetails = useCallback(() => {
    setPendingDetailReveal(false);
    setShowDetails(true);
    setDetailRevealSource("manual");
  }, []);

  const handleEditSetup = () => {
    if (!onEditSetup) return;
    const proceed = window.confirm(
      "Editing setup will clear the current draft and regenerate the script. Continue?",
    );
    if (!proceed) return;
    onEditSetup();
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncCanHover = () => setCanHover(hoverQuery.matches);
    syncCanHover();
    if (typeof hoverQuery.addEventListener === "function") {
      hoverQuery.addEventListener("change", syncCanHover);
      return () => hoverQuery.removeEventListener("change", syncCanHover);
    }
    hoverQuery.addListener(syncCanHover);
    return () => hoverQuery.removeListener(syncCanHover);
  }, []);
  useEffect(() => {
    return () => {
      if (styleShufflePulseTimeoutRef.current !== null) {
        window.clearTimeout(styleShufflePulseTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setPrefersReducedMotion(motionQuery.matches);
    syncReducedMotion();
    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", syncReducedMotion);
      return () => motionQuery.removeEventListener("change", syncReducedMotion);
    }
    motionQuery.addListener(syncReducedMotion);
    return () => motionQuery.removeListener(syncReducedMotion);
  }, []);
  useEffect(() => {
    if (!autoSurprise) {
      autoSurpriseRef.current = false;
      return;
    }
    if (autoSurpriseRef.current || isSurprising || isLocked) return;
    autoSurpriseRef.current = true;
    void handleGenerateSurpriseSetup("auto");
  }, [autoSurprise, handleGenerateSurpriseSetup, isLocked, isSurprising]);

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
    const handleModalKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStyleLibraryOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const modalRoot = styleLibraryModalRef.current;
      if (!modalRoot) return;
      const focusableElements = modalRoot.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusableElements.length === 0) return;
      const firstFocusable = focusableElements.item(0);
      const lastFocusable = focusableElements.item(focusableElements.length - 1);
      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement || !modalRoot.contains(activeElement)) {
        event.preventDefault();
        firstFocusable?.focus();
        return;
      }
      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable?.focus();
        return;
      }
      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    };
    window.addEventListener("keydown", handleModalKeyboard);
    return () => {
      window.removeEventListener("keydown", handleModalKeyboard);
    };
  }, [isStyleLibraryOpen]);

  const trimmedPremise = premise.trim();
  const normalizedStyleSearch = styleSearch.trim().toLowerCase();
  const normalizedStyle = normalizeStyleValue(style);
  const normalizedStyleId =
    typeof styleId === "string" && styleId.trim().length > 0
      ? styleId.trim()
      : "";
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
  const selectedLibraryStyle = useMemo(() => {
    const byId = normalizedStyleId
      ? stylesLibrary.find((item) => item.id === normalizedStyleId) ?? null
      : null;
    if (byId) return byId;
    // Legacy fallback for persisted title-only setups.
    return (
      stylesLibrary.find(
        (item) => normalizeStyleValue(item.title) === normalizedStyle,
      ) ?? null
    );
  }, [normalizedStyle, normalizedStyleId]);
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
    updateValue({ styleId: randomStyle.id, style: randomStyle.title });
    setStyleShufflePulse(true);
    if (styleShufflePulseTimeoutRef.current !== null) {
      window.clearTimeout(styleShufflePulseTimeoutRef.current);
    }
    styleShufflePulseTimeoutRef.current = window.setTimeout(() => {
      setStyleShufflePulse(false);
    }, 280);
  }, [isLocked, updateValue]);
  const handleSelectStyleFromLibrary = useCallback(
    (nextStyle: { styleId: string | null; style: string }) => {
      updateValue(nextStyle);
      setIsStyleLibraryOpen(false);
    },
    [updateValue],
  );
  const handleClearStyle = useCallback(() => {
    updateValue({ styleId: null, style: "" });
  }, [updateValue]);
  const premiseSnippet =
    trimmedPremise.length > 140
      ? `${trimmedPremise.slice(0, 140)}...`
      : trimmedPremise || "No premise yet.";
  const castCount = characters.filter((char) => char.trim().length > 0).length;
  const resolvedStyleLabel = selectedLibraryStyle?.title ?? style.trim();
  const summaryParts = [genre, length, resolvedStyleLabel].filter(Boolean);
  const summaryLine = summaryParts.join(" / ");
  const isStyleBlank = !resolvedStyleLabel;
  const isSummaryOnly = variant === "summary";
  const showSummary = isLocked || isSummaryOnly;
  const hasValidCharacter = characters.some((char) => char.trim().length > 0);
  const normalizedLength = normalizeLengthValue(length);
  const characterCount = characters.length;
  const motionBaseClass =
    "transition-[opacity,transform,box-shadow] duration-[220ms] ease-out";
  const pressFeedbackClass =
    "hover:-translate-y-px active:translate-y-px active:duration-[140ms] active:ease-in-out";
  const styleCardMotionClass =
    "transition-[box-shadow,opacity,transform] duration-[280ms] ease-in-out";
  const focusRingClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
  const interactiveControlClass = `${motionBaseClass} ${pressFeedbackClass} ${focusRingClass}`;
  const detailPanelClass = "space-y-2";
  const setupSectionLabelClass = setupUi.sectionLabel;
  const setupBodyTextClass = setupUi.bodyText;
  const setupBodyMutedTextClass = setupUi.bodyMutedText;
  const setupMetaTextClass = setupUi.metaText;
  const setupPanelSurfaceClass = setupUi.panelSurface;
  const setupActionButtonBaseClass = `w-full py-4 sm:py-[1.05rem] ${setupUi.buttonText} transition-[opacity,transform,box-shadow] duration-[220ms] ease-out active:duration-[140ms] active:ease-in-out active:translate-y-px text-center rounded-xl`;
  const styleActionButtonBaseClass = `rounded-lg px-3 py-2.5 ${setupUi.buttonText} ring-1 ${interactiveControlClass}`;
  const styleCardPulseClass = styleShufflePulse
    ? "shadow-[0_14px_34px_-26px_rgba(129,140,248,0.85)]"
    : "shadow-none";

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
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <label className={setupSectionLabelClass}>
                  Genre
                </label>
                <p className={setupBodyMutedTextClass}>
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
                  className={`px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-lg text-left ring-1 ${interactiveControlClass} ${
                    genre === g
                      ? "bg-indigo-500/22 text-indigo-200 ring-indigo-300/55 shadow-[0_0_0_1px_rgba(129,140,248,0.35)_inset]"
                      : "bg-white/[0.03] text-slate-300 ring-white/15 hover:opacity-95 hover:shadow-[0_10px_20px_-18px_rgba(148,163,184,0.9)]"
                  } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/10" aria-hidden="true" />

          <div className="space-y-3">
            <div className="space-y-1">
              <label className={setupSectionLabelClass}>
                Style
              </label>
              <p className={setupBodyMutedTextClass}>
                Pick a vibe from the library. This sets tone for future
                generations.
              </p>
            </div>
            <div className="space-y-2">
              <div
                className={`group ${setupPanelSurfaceClass} px-3 py-3 space-y-2 ${styleCardMotionClass} ${styleCardPulseClass}`}
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`min-w-0 truncate ${setupSectionLabelClass} text-slate-400`}>
                    Selected style
                  </p>
                  {!isStyleBlank && (
                    <div className="ml-auto flex-none shrink-0 w-auto min-h-5 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleClearStyle}
                        disabled={isLocked}
                        aria-label="Clear selected style"
                        className={`rounded-md px-1.5 py-0.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-indigo-100 hover:underline hover:bg-indigo-500/15 ${interactiveControlClass} ${
                          canHover
                            ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                            : "opacity-100"
                        } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                        title="Clear selected style"
                      >
                        × Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <p className="text-base md:text-lg font-semibold leading-relaxed text-slate-100">
                      {selectedLibraryStyle?.title ??
                        (isStyleBlank ? "None (default style)" : style.trim())}
                    </p>
                    {selectedStyleCategoryLabel && (
                      <span className="rounded-full bg-white/[0.03] ring-1 ring-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                        {selectedStyleCategoryLabel}
                      </span>
                    )}
                  </div>
                </div>
                {selectedLibraryStyle ? (
                  <>
                    <p className={`${setupBodyTextClass} line-clamp-2 sm:line-clamp-none`}>
                      {selectedLibraryStyle.description}
                    </p>
                    <p className={`${setupBodyTextClass} text-slate-200 line-clamp-2 sm:line-clamp-none`}>
                      <span className="font-semibold text-slate-400">
                        Sample line:
                      </span>{" "}
                      {selectedLibraryStyle.sampleLine}
                    </p>
                  </>
                ) : (
                  <p className={setupBodyTextClass}>
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
                    className={`shrink-0 ${styleActionButtonBaseClass} ${
                      isLocked || stylesLibrary.length === 0
                        ? "opacity-60 cursor-not-allowed text-slate-300/70 bg-indigo-500/10 ring-indigo-200/25"
                        : "text-slate-100 bg-indigo-500/20 ring-indigo-200/40 hover:opacity-95 hover:shadow-[0_10px_24px_-18px_rgba(129,140,248,0.9)]"
                    }`}
                  >
                    Shuffle
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsStyleLibraryOpen(true)}
                    disabled={isLocked}
                    className={`inline-flex items-center gap-1.5 ${styleActionButtonBaseClass} ${
                      isLocked
                        ? "opacity-60 cursor-not-allowed text-slate-300/70 bg-indigo-500/10 ring-indigo-200/25"
                        : "text-slate-100 bg-indigo-500/20 ring-indigo-200/40 hover:opacity-95 hover:shadow-[0_10px_24px_-18px_rgba(129,140,248,0.9)]"
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
                ref={styleLibraryModalRef}
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
                    className={`rounded-lg p-1.5 text-indigo-100/80 hover:text-indigo-100 hover:bg-indigo-500/20 ${interactiveControlClass}`}
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
                    className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-indigo-100/55 bg-slate-900/70 ring-1 ring-indigo-200/25 focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-[box-shadow,opacity] duration-[220ms] ease-in-out"
                    placeholder="Search styles..."
                    aria-label="Search styles"
                    disabled={isLocked}
                  />
                  <div className="max-h-[58vh] overflow-y-auto rounded-xl bg-slate-950/70 ring-1 ring-white/10">
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectStyleFromLibrary({
                            styleId: null,
                            style: "",
                          })
                        }
                        disabled={isLocked}
                        aria-pressed={isStyleBlank}
                        className={`w-full rounded-lg px-3 py-2 text-left ring-1 ${interactiveControlClass} ${
                          isStyleBlank
                            ? "bg-indigo-500/30 ring-indigo-100/55 text-indigo-100"
                            : "bg-white/[0.02] ring-white/10 text-slate-200 hover:opacity-95 hover:shadow-[0_10px_20px_-18px_rgba(148,163,184,0.9)]"
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
                            const isSelected = selectedLibraryStyle?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                ref={(element) => {
                                  styleRowRefs.current[item.id] = element;
                                }}
                                type="button"
                                onClick={() =>
                                  handleSelectStyleFromLibrary({
                                    styleId: item.id,
                                    style: item.title,
                                  })
                                }
                                disabled={isLocked}
                                aria-pressed={isSelected}
                                className={`w-full rounded-lg px-3 py-2 text-left ring-1 ${interactiveControlClass} ${
                                  isSelected
                                    ? "bg-indigo-500/30 ring-indigo-100/55 text-indigo-100"
                                    : "bg-white/[0.02] ring-white/10 text-slate-200 hover:opacity-95 hover:shadow-[0_10px_20px_-18px_rgba(148,163,184,0.9)]"
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
                void handleGenerateSurpriseSetup("manual");
              }}
              className={`${setupActionButtonBaseClass} !bg-indigo-500/15 hover:!bg-indigo-500/25 !border-indigo-500/30 text-indigo-100`}
              type="button"
              loading={isSurprising}
              disabled={isLoading || isSurprising || isLocked}
            >
              Generate AI Premise
            </Button>
            <Button
              variant="secondary"
              onClick={showManualDetails}
              className={`${setupActionButtonBaseClass} !bg-slate-800/50 hover:!bg-slate-700/50 !border-white/10 text-slate-300`}
              type="button"
              disabled={isLocked}
            >
              Write My Own Premise
            </Button>
          </div>

          {!showDetails && (
            <div className={`${setupPanelSurfaceClass} px-3 py-2.5 space-y-1.5`}>
              <p className={`${setupSectionLabelClass} text-slate-400`}>
                Preview
              </p>
              <p className={setupBodyTextClass}>
                <span className="text-slate-400">Premise:</span> Will be
                generated after you click Generate AI Premise...
              </p>
              <p className={setupBodyTextClass}>
                <span className="text-slate-400">Cast:</span> Will be
                generated...
              </p>
            </div>
          )}

          {showDetails && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-[1.12fr_0.88fr] gap-5 md:items-stretch md:[grid-auto-rows:1fr]">
                <div
                  className={`${detailPanelClass} flex h-full flex-col`}
                  data-testid="setup-premise-panel"
                >
                  <label className={setupSectionLabelClass}>
                    Premise
                  </label>
                  <div className="flex flex-1 flex-col gap-2">
                    <textarea
                      rows={8}
                      value={premise}
                      onChange={(e) => updateValue({ premise: e.target.value })}
                      className={`w-full flex-1 min-h-[220px] rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none transition-none resize-none text-sm sm:text-base leading-relaxed ${
                        justSurprised
                          ? "bg-indigo-900/25 shadow-[0_0_18px_rgba(99,102,241,0.14)]"
                          : "bg-slate-900/60"
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
                            onClick={() => handleStarterIdeaClick(idea)}
                            disabled={isLocked}
                            className="w-full text-left text-xs sm:text-sm text-slate-300 hover:text-indigo-100 bg-slate-900/65 hover:bg-indigo-500/20 rounded-full px-3 py-2 transition-[opacity,color,background-color] duration-[220ms] ease-out cursor-pointer border border-white/10 hover:border-indigo-300/50 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {idea}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`${detailPanelClass} flex h-full flex-col`}
                  data-testid="setup-characters-panel"
                >
                  <div className="space-y-2 flex h-full flex-1 flex-col">
                    <label className={`${setupSectionLabelClass} flex items-center gap-2`}>
                      <Users className="w-3.5 h-3.5 text-indigo-300" /> Characters
                    </label>
                    <div className="space-y-2 flex-1 min-h-0">
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
                            className={`w-full rounded-xl border px-3 py-3 pr-8 text-white text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 transition-[background-color,border-color,box-shadow] duration-[220ms] ease-out ${
                              justSurprised
                                ? "bg-indigo-900/25 border-indigo-400/45"
                                : "bg-slate-900/70 border-white/10"
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
                        className="w-full py-2.5 rounded-xl text-slate-300 hover:text-indigo-200 text-sm font-medium transition-[opacity,color,border-color,box-shadow] duration-[220ms] ease-out flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 border border-dashed border-white/20 hover:border-indigo-300/55 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Character
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1.12fr_0.88fr] gap-5">
                <div className={`border-t border-white/10 pt-3 flex items-center gap-2 ${setupMetaTextClass}`}>
                  <span className="uppercase tracking-[0.2em] text-slate-500">
                    Length:
                  </span>
                  <LengthCycleWheel
                    value={normalizedLength}
                    disabled={isLocked}
                    prefersReducedMotion={prefersReducedMotion}
                    focusRingClass={focusRingClass}
                    onChange={(nextLength) => updateValue({ length: nextLength })}
                  />
                </div>

                <div className="flex items-center md:justify-start">
                  <p className={setupMetaTextClass}>
                    {characterCount}{" "}
                    {characterCount === 1 ? "character" : "characters"}
                  </p>
                </div>
              </div>

              {showSubmit && onStart && (
                <Button
                  variant="primary"
                  onClick={onStart}
                  className="w-full shadow-[0_14px_40px_rgba(99,102,241,0.3)] hover:shadow-[0_18px_52px_rgba(99,102,241,0.42)] !bg-indigo-600 hover:!bg-indigo-500 transition-all text-base font-medium mt-4 py-4"
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
