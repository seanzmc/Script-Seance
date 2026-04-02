import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "./Button";
import { SETUP_UI_TOKENS } from "./setupUiTokens";
import { STYLE_CATEGORIES, stylesLibrary } from "../stylesLibrary";
import { normalizeLengthValue } from "./LengthCycleWheel";
import { StyleLibraryDialog, resolveSelectedLibraryStyle } from "./StyleLibraryDialog";
import { DetailsStage } from "./setup/DetailsStage";
import { GenreWheelStage } from "./setup/GenreWheelStage";
import { GENRE_SURFACE_LAYOUT_ID, STYLE_SURFACE_LAYOUT_ID } from "./setup/setupLayoutIds";
import { StyleSelectionStage } from "./setup/StyleSelectionStage";
import {
  modalVariants,
  overlayVariants,
} from "./motion/primitives";

export type VoicePreference = "male" | "female" | "random";

export const DEFAULT_CHARACTER_VOICE_PREFERENCE: VoicePreference = "random";
export const DEFAULT_NARRATOR_VOICE_PREFERENCE: VoicePreference = "male";

export type SetupFormState = {
  genre: string;
  premise: string;
  characters: string[];
  characterVoicePreferences?: VoicePreference[];
  narratorVoicePreference?: VoicePreference;
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

const isVoicePreference = (value: unknown): value is VoicePreference =>
  value === "male" || value === "female" || value === "random";
const getSurpriseSetupErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const record = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const code = typeof record.code === "string" ? record.code : "";
  const status = typeof record.status === "number" ? record.status : null;
  const message = typeof record.message === "string" ? record.message.trim() : "";

  if (code === "REQUEST_TIMEOUT" || code === "UPSTREAM_TIMEOUT") {
    return "AI premise generation timed out. Try again or write your own premise.";
  }
  if (status === 429) {
    return "AI premise generation is rate limited right now. Wait a moment, then try again.";
  }
  if (status === 401) {
    return "Your session expired. Log in again, then retry AI premise generation.";
  }
  if (code === "INVALID_AI_RESPONSE") {
    return "The AI premise draft came back incomplete. Try again or write your own premise.";
  }
  return message || fallbackMessage;
};
const normalizeVoicePreference = (
  value: unknown,
  fallback: VoicePreference,
): VoicePreference => (isVoicePreference(value) ? value : fallback);
export const synchronizeSetupVoicePreferences = (
  value: Pick<
    SetupFormState,
    "characters" | "characterVoicePreferences" | "narratorVoicePreference"
  >,
) => ({
  characterVoicePreferences: value.characters.map((_, index) =>
    normalizeVoicePreference(
      value.characterVoicePreferences?.[index],
      DEFAULT_CHARACTER_VOICE_PREFERENCE,
    ),
  ),
  narratorVoicePreference: normalizeVoicePreference(
    value.narratorVoicePreference,
    DEFAULT_NARRATOR_VOICE_PREFERENCE,
  ),
});
const getNextVoicePreference = (
  value: VoicePreference,
): VoicePreference =>
  value === "male" ? "female" : value === "female" ? "random" : "male";
type SetupActiveStage = "genre" | "style" | "details";
type SetupEditableStage = Exclude<SetupActiveStage, "details">;

const getStageRank = (stage: SetupActiveStage): number =>
  stage === "genre" ? 0 : stage === "style" ? 1 : 2;

const getNearestScrollContainer = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const deriveInitialStage = ({
  premise,
  characters,
  style,
  styleId,
}: Pick<SetupFormState, "premise" | "characters" | "style" | "styleId">): SetupActiveStage => {
  const hasPremise = premise.trim().length > 0;
  const hasCharacter = characters.some((character) => character.trim().length > 0);
  if (hasPremise && hasCharacter) {
    return "details";
  }
  if (
    (typeof styleId === "string" && styleId.trim().length > 0) ||
    style.trim().length > 0
  ) {
    return "style";
  }
  return "genre";
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
  const {
    characterVoicePreferences = [],
    narratorVoicePreference = DEFAULT_NARRATOR_VOICE_PREFERENCE,
  } = value;
  const [isSurprising, setIsSurprising] = useState(false);
  const [surpriseError, setSurpriseError] = useState<string | null>(null);
  const [justSurprised, setJustSurprised] = useState(false);
  const [activeStage, setActiveStage] = useState<SetupActiveStage>(() =>
    deriveInitialStage({ premise, characters, style, styleId }),
  );
  const [detailRevealSource, setDetailRevealSource] = useState<
    "manual" | "ai" | null
  >(null);
  const [isStyleLibraryOpen, setIsStyleLibraryOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [styleShufflePulse, setStyleShufflePulse] = useState(false);
  const [manualStageOverride, setManualStageOverride] =
    useState<SetupEditableStage | null>(null);
  const [stageReactivationPrompt, setStageReactivationPrompt] =
    useState<SetupEditableStage | null>(null);
  const autoSurpriseRef = useRef(false);
  const styleShufflePulseTimeoutRef = useRef<number | null>(null);
  const detailsFooterRef = useRef<HTMLDivElement | null>(null);
  const stageReactivationModalRef = useRef<HTMLDivElement | null>(null);
  const stageReactivationCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const stageFocusTargetRef = useRef<SetupEditableStage | null>(null);
  const genreContinueButtonRef = useRef<HTMLButtonElement | null>(null);
  const styleAiButtonRef = useRef<HTMLButtonElement | null>(null);
  const styleManualButtonRef = useRef<HTMLButtonElement | null>(null);
  const stageReactivationTriggerRef = useRef<HTMLElement | null>(null);

  const characterInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const setupUi = SETUP_UI_TOKENS;
  const synchronizedVoicePreferences = useMemo(
    () =>
      synchronizeSetupVoicePreferences({
        characters,
        characterVoicePreferences,
        narratorVoicePreference,
      }),
    [characters, characterVoicePreferences, narratorVoicePreference],
  );

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
  const cycleCharacterVoicePreference = (index: number) => {
    const nextPreferences = [...synchronizedVoicePreferences.characterVoicePreferences];
    nextPreferences[index] = getNextVoicePreference(nextPreferences[index]);
    updateValue({ characterVoicePreferences: nextPreferences });
  };
  const cycleNarratorVoicePreference = () =>
    updateValue({
      narratorVoicePreference: getNextVoicePreference(narratorVoicePreference),
    });

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

  const requestDetailsStage = useCallback(
    (source: "manual" | "ai") => {
      setManualStageOverride(null);
      setDetailRevealSource(source);
      setActiveStage("details");
    },
    [],
  );

  const triggerSurpriseHighlight = useCallback(() => {
    setJustSurprised(true);
    setTimeout(() => setJustSurprised(false), 1500);
  }, []);

  const handleGenerateSurpriseSetup = useCallback(
    async (mode: "manual" | "auto") => {
      if (isLocked) return;
      if (!confirmSetupOverwrite()) return;

      setSurpriseError(null);
      setIsSurprising(true);
      const targetGenre = genre;
      const fallbackMessage = "Failed to generate a surprise setup.";

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

        requestDetailsStage("ai");
        triggerSurpriseHighlight();
      } catch (e) {
        console.error("Surprise generation failed", e);
        onError?.(e, fallbackMessage);
        setSurpriseError(getSurpriseSetupErrorMessage(e, fallbackMessage));
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
      requestDetailsStage,
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
    setSurpriseError(null);
    requestDetailsStage("manual");
  }, [requestDetailsStage]);

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
    if (manualStageOverride) {
      setActiveStage(manualStageOverride);
      return;
    }
    const derivedStage = deriveInitialStage({ premise, characters, style, styleId });
    setActiveStage((previousStage) =>
      getStageRank(derivedStage) > getStageRank(previousStage)
        ? derivedStage
        : previousStage,
    );
  }, [characters, manualStageOverride, premise, style, styleId]);
  useEffect(() => {
    if (activeStage === "details" && detailRevealSource === null) {
      setDetailRevealSource("manual");
    }
  }, [activeStage, detailRevealSource]);
  useEffect(() => {
    if (activeStage !== "details") return;
    const footer = detailsFooterRef.current;
    if (!footer || typeof footer.scrollIntoView !== "function") return;
    let frameId = 0;
    let settleFrameId = 0;
    let timeoutId: number | null = null;

    const alignFooter = () => {
      const scrollContainer = getNearestScrollContainer(footer);
      if (!scrollContainer) {
        footer.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }

      const footerRect = footer.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const bottomGap = footerRect.bottom - (containerRect.bottom - 16);
      const topGap = containerRect.top + 16 - footerRect.top;

      if (bottomGap > 6) {
        scrollContainer.scrollTop += bottomGap;
        return;
      }
      if (topGap > 6) {
        scrollContainer.scrollTop -= topGap;
      }

      window.requestAnimationFrame(() => {
        const nextFooterRect = footer.getBoundingClientRect();
        const nextContainerRect = scrollContainer.getBoundingClientRect();
        if (
          nextFooterRect.bottom > nextContainerRect.bottom - 16 ||
          nextFooterRect.top < nextContainerRect.top + 16
        ) {
          footer.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    };

    frameId = window.requestAnimationFrame(() => {
      settleFrameId = window.requestAnimationFrame(() => {
        timeoutId = window.setTimeout(alignFooter, 120);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(settleFrameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeStage]);
  const closeStageReactivationPrompt = useCallback(
    (restoreFocus = true) => {
      setStageReactivationPrompt(null);
      if (!restoreFocus) return;
      const triggerElement = stageReactivationTriggerRef.current;
      if (
        !triggerElement ||
        typeof triggerElement.focus !== "function" ||
        !document.contains(triggerElement)
      ) {
        return;
      }
      window.requestAnimationFrame(() => {
        triggerElement.focus();
      });
    },
    [],
  );
  useEffect(() => {
    if (!stageReactivationPrompt) return;
    const animationId = requestAnimationFrame(() => {
      stageReactivationCancelButtonRef.current?.focus();
    });
    const handleModalKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStageReactivationPrompt();
        return;
      }
      if (event.key !== "Tab") return;
      const modalRoot = stageReactivationModalRef.current;
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
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", handleModalKeyboard);
    };
  }, [closeStageReactivationPrompt, stageReactivationPrompt]);
  useEffect(() => {
    const focusTarget = stageFocusTargetRef.current;
    if (!focusTarget || focusTarget !== activeStage) return;
    const nextFocusTarget =
      focusTarget === "genre"
        ? genreContinueButtonRef.current
        : styleAiButtonRef.current ?? styleManualButtonRef.current;
    if (!nextFocusTarget || typeof nextFocusTarget.focus !== "function") {
      stageFocusTargetRef.current = null;
      return;
    }
    const animationId = requestAnimationFrame(() => {
      nextFocusTarget.focus();
    });
    stageFocusTargetRef.current = null;
    return () => cancelAnimationFrame(animationId);
  }, [activeStage]);

  const trimmedPremise = premise.trim();
  const activePremiseSource = detailRevealSource ?? "manual";
  const selectedLibraryStyle = useMemo(
    () => resolveSelectedLibraryStyle(styleId, style),
    [styleId, style],
  );
  const selectedStyleCategoryLabel = useMemo(() => {
    if (!selectedLibraryStyle) return null;
    return (
      STYLE_CATEGORIES.find(
        (category) => category.id === selectedLibraryStyle.category,
      )?.label ?? null
    );
  }, [selectedLibraryStyle]);
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
  const showDetails = activeStage === "details";
  const isGenreStage = activeStage === "genre";
  const isStyleStage = activeStage === "style";
  const isDetailsStage = activeStage === "details";
  const motionBaseClass =
    "transition-[opacity,transform,box-shadow] duration-[220ms] ease-out";
  const pressFeedbackClass =
    "hover:-translate-y-px active:translate-y-px active:duration-[140ms] active:ease-in-out";
  const styleCardMotionClass =
    "transition-[box-shadow,opacity,transform] duration-[280ms] ease-in-out";
  const focusRingClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
  const interactiveControlClass = `${motionBaseClass} ${pressFeedbackClass} ${focusRingClass}`;
  const setupSectionLabelClass = setupUi.sectionLabel;
  const styleCardPulseClass = styleShufflePulse
    ? "shadow-[0_14px_34px_-26px_rgba(129,140,248,0.85)]"
    : "shadow-none";
  const stageSurfaceBaseClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)]";
  const summaryCardClass =
    `${stageSurfaceBaseClass} bg-white/[0.03] px-4 py-3.5 sm:px-5 sm:py-4 transition-[border-color,background-color,box-shadow,transform] duration-[240ms] ease-out`;
  const summaryLinkButtonClass = `inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${interactiveControlClass}`;
  const parkedRailClass = isDetailsStage
    ? "grid gap-3 md:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]"
    : "grid max-w-md gap-3";
  const genreSurfaceLayoutId = prefersReducedMotion
    ? undefined
    : GENRE_SURFACE_LAYOUT_ID;
  const styleSurfaceLayoutId = prefersReducedMotion
    ? undefined
    : STYLE_SURFACE_LAYOUT_ID;
  const hasInvalidatableCharacters = characters.some(
    (character) => character.trim().length > 0,
  );
  const hasInvalidatableSetupDetails =
    trimmedPremise.length > 0 || hasInvalidatableCharacters;
  const handleGenreAdvance = useCallback(() => {
    setManualStageOverride(null);
    setActiveStage((previousStage) =>
      getStageRank(previousStage) < getStageRank("style")
        ? "style"
        : previousStage,
    );
  }, []);
  const handleGenreChange = useCallback(
    (nextGenre: string) => {
      updateValue({ genre: nextGenre });
    },
    [updateValue],
  );
  const activateEarlierStage = useCallback((nextStage: SetupEditableStage) => {
    stageFocusTargetRef.current = nextStage;
    setDetailRevealSource(null);
    setManualStageOverride(nextStage);
    setActiveStage(nextStage);
  }, []);
  const clearStepThreeSetupDetails = useCallback(() => {
    setDetailRevealSource(null);
    setJustSurprised(false);
    updateValue({
      premise: "",
      characters: [],
      characterVoicePreferences: [],
    });
  }, [updateValue]);
  const requestStageReactivation = useCallback(
    (nextStage: SetupEditableStage, triggerElement: HTMLElement | null) => {
      if (isLocked) return;
      if (activeStage === "details" && hasInvalidatableSetupDetails) {
        stageReactivationTriggerRef.current = triggerElement;
        setStageReactivationPrompt(nextStage);
        return;
      }
      activateEarlierStage(nextStage);
    },
    [
      activateEarlierStage,
      activeStage,
      hasInvalidatableSetupDetails,
      isLocked,
    ],
  );
  const confirmStageReactivation = useCallback(() => {
    if (!stageReactivationPrompt) return;
    const nextStage = stageReactivationPrompt;
    closeStageReactivationPrompt(false);
    clearStepThreeSetupDetails();
    activateEarlierStage(nextStage);
  }, [
    activateEarlierStage,
    clearStepThreeSetupDetails,
    closeStageReactivationPrompt,
    stageReactivationPrompt,
  ]);
  const openStyleLibrary = useCallback(() => {
    setIsStyleLibraryOpen(true);
  }, []);
  const styleSummaryLabel = isStyleBlank
    ? "Default tone"
    : resolvedStyleLabel;
  const styleSummaryDescription = selectedLibraryStyle
    ? selectedLibraryStyle.description
    : isStyleBlank
      ? "Using default tone settings."
      : "Custom style selected.";

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
              Change setup
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
          <LayoutGroup id="setup-progression">
            <m.div
              className="flex w-full flex-col gap-3"
              layout="position"
            >
              {!isGenreStage && (
                <m.div
                  layout="position"
                  className={`${parkedRailClass} transition-[transform,opacity] duration-[260ms] ease-out`}
                >
                  <m.div
                    layout
                    layoutId={genreSurfaceLayoutId}
                    className={`${summaryCardClass} ${styleCardMotionClass}`}
                    data-testid="setup-genre-summary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <p className={`${setupSectionLabelClass} text-slate-400`}>
                          Genre
                        </p>
                        <p className="text-[1.75rem] font-semibold tracking-tight text-slate-50 sm:text-[2rem]">
                          {genre}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) =>
                          requestStageReactivation("genre", event.currentTarget)
                        }
                        disabled={isLocked}
                        className={`${summaryLinkButtonClass} shrink-0 ${
                          isLocked
                            ? "cursor-not-allowed bg-white/[0.04] text-slate-400 opacity-60"
                            : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                        }`}
                        title="Go back to Step 1"
                      >
                        Change genre
                      </button>
                    </div>
                  </m.div>

                  <AnimatePresence initial={false}>
                    {isDetailsStage ? (
                      <m.div
                        key="setup-style-summary-card"
                        layout
                        layoutId={styleSurfaceLayoutId}
                        className={`group ${summaryCardClass} ${styleCardMotionClass} ${styleCardPulseClass}`}
                        aria-live="polite"
                        data-testid="setup-style-summary"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <p className={`${setupSectionLabelClass} text-slate-400`}>
                              Style
                            </p>
                            <p className="text-base font-semibold text-slate-100">
                              {styleSummaryLabel}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(event) =>
                              requestStageReactivation("style", event.currentTarget)
                            }
                            disabled={isLocked}
                            className={`${summaryLinkButtonClass} shrink-0 ${
                              isLocked
                                ? "cursor-not-allowed bg-white/[0.04] text-slate-400 opacity-60"
                                : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                            }`}
                            title="Go back to Step 2"
                          >
                            Change style
                          </button>
                        </div>
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                </m.div>
              )}
              <AnimatePresence initial={false} mode="wait">
                {isGenreStage ? (
                  <GenreWheelStage
                    key="setup-stage-genre"
                    genre={genre}
                    isLocked={Boolean(isLocked)}
                    prefersReducedMotion={prefersReducedMotion}
                    layoutId={genreSurfaceLayoutId}
                    continueButtonRef={genreContinueButtonRef}
                    onGenreChange={handleGenreChange}
                    onAdvance={handleGenreAdvance}
                  />
                ) : null}

                {isStyleStage ? (
                  <StyleSelectionStage
                    key="setup-stage-style"
                    selectedLibraryStyle={selectedLibraryStyle}
                    selectedStyleCategoryLabel={selectedStyleCategoryLabel}
                    styleSummaryLabel={styleSummaryLabel}
                    styleSummaryDescription={styleSummaryDescription}
                    isStyleBlank={isStyleBlank}
                    isStyleLibraryOpen={isStyleLibraryOpen}
                    isLoading={isLoading}
                    isLocked={Boolean(isLocked)}
                    isSurprising={isSurprising}
                    styleShufflePulse={styleShufflePulse}
                    surpriseError={surpriseError}
                    canHover={canHover}
                    layoutId={styleSurfaceLayoutId}
                    aiButtonRef={styleAiButtonRef}
                    manualButtonRef={styleManualButtonRef}
                    onClearStyle={handleClearStyle}
                    onOpenStyleLibrary={openStyleLibrary}
                    onShuffleStyle={handleStyleShuffle}
                    onAdvance={showManualDetails}
                    onSurprise={() => {
                      void handleGenerateSurpriseSetup("manual");
                    }}
                    onTryAgain={() => {
                      void handleGenerateSurpriseSetup("manual");
                    }}
                    onSwitchToManual={showManualDetails}
                  />
                ) : null}

                {showDetails ? (
                  <DetailsStage
                    key="setup-stage-details"
                    premise={premise}
                    characters={characters}
                    characterVoicePreferences={synchronizedVoicePreferences.characterVoicePreferences}
                    narratorVoicePreference={synchronizedVoicePreferences.narratorVoicePreference}
                    length={normalizedLength}
                    isLoading={isLoading}
                    isLocked={Boolean(isLocked)}
                    isSurprising={isSurprising}
                    justSurprised={justSurprised}
                    activePremiseSource={activePremiseSource}
                    showSubmit={showSubmit}
                    prefersReducedMotion={prefersReducedMotion}
                    hasValidCharacter={hasValidCharacter}
                    detailsFooterRef={detailsFooterRef}
                    characterInputsRef={characterInputs}
                    onPremiseChange={(nextPremise) => updateValue({ premise: nextPremise })}
                    onCharacterChange={handleCharacterChange}
                    onLengthChange={(nextLength) => updateValue({ length: nextLength })}
                    onNarratorVoiceChange={cycleNarratorVoicePreference}
                    onCharacterVoiceChange={cycleCharacterVoicePreference}
                    onAddCharacter={addCharacter}
                    onRemoveCharacter={removeCharacter}
                    onStarterIdeaClick={handleStarterIdeaClick}
                    onStart={onStart}
                  />
                ) : null}
              </AnimatePresence>
            </m.div>
          </LayoutGroup>

          <AnimatePresence initial={false}>
            {stageReactivationPrompt ? (
              <div
                key="setup-stage-reactivation-prompt"
                className="fixed inset-0 z-content-modal flex items-center justify-center px-4"
              >
                <m.div
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => closeStageReactivationPrompt()}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={overlayVariants}
                />
                <m.div
                  ref={stageReactivationModalRef}
                  className="relative w-full max-w-sm rounded-xl border border-white/10 bg-slate-900/95 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.95)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="setup-step-reactivation-title"
                  aria-describedby="setup-step-reactivation-description"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={modalVariants}
                >
                  <div className="space-y-4">
                    <h2
                      id="setup-step-reactivation-title"
                      className="mt-1 text-base font-semibold text-white"
                    >
                      Return to {stageReactivationPrompt === "genre" ? "Step 1" : "Step 2"}?
                    </h2>
                    <p
                      id="setup-step-reactivation-description"
                      className="text-sm leading-relaxed text-slate-300"
                    >
                      Your premise and characters will be cleared. You&apos;ll
                      start that step fresh.
                    </p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        ref={stageReactivationCancelButtonRef}
                        type="button"
                        onClick={() => closeStageReactivationPrompt()}
                        className={`rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-200 ${interactiveControlClass}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmStageReactivation}
                        className={`rounded-lg border border-indigo-300/30 bg-indigo-500/14 px-4 py-2.5 text-sm font-medium text-indigo-100 ${interactiveControlClass}`}
                      >
                        Go back and clear setup details
                      </button>
                    </div>
                  </div>
                </m.div>
              </div>
            ) : null}
            <StyleLibraryDialog
              key="setup-style-library-dialog"
              isOpen={isStyleLibraryOpen}
              selectedStyleId={styleId}
              selectedStyleTitle={style}
              onClose={() => setIsStyleLibraryOpen(false)}
              onSelect={handleSelectStyleFromLibrary}
              disabled={Boolean(isLocked)}
              listTestId="setup-style-library-list"
            />
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
