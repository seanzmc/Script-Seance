import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Users, Plus, Search, Trash2, X, Mars, Venus, Shuffle } from "lucide-react";
import { STYLE_CATEGORIES, stylesLibrary } from "../stylesLibrary";

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
const isVoicePreference = (value: unknown): value is VoicePreference =>
  value === "male" || value === "female" || value === "random";
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
type SetupActiveStage = "genre" | "style" | "details";
type GenreWheelDirection = 1 | -1;
type WheelPointerState = {
  pointerId: number | null;
  lastY: number;
  carryY: number;
  moved: boolean;
};

const SCENE_LENGTH_VALUES: readonly SceneLengthValue[] = ["Short", "Medium", "Long"];

const normalizeLengthValue = (value: string): SceneLengthValue =>
  value === "Short" || value === "Long" ? value : "Medium";

const getNextLengthValue = (value: SceneLengthValue): SceneLengthValue =>
  value === "Short" ? "Medium" : value === "Medium" ? "Long" : "Short";

const getAdjacentLengthValue = (
  currentValue: SceneLengthValue,
  direction: GenreWheelDirection,
): SceneLengthValue => {
  const currentIndex = Math.max(0, SCENE_LENGTH_VALUES.indexOf(currentValue));
  const nextIndex =
    (currentIndex + direction + SCENE_LENGTH_VALUES.length) %
    SCENE_LENGTH_VALUES.length;
  return SCENE_LENGTH_VALUES[nextIndex] ?? currentValue;
};

const getAdjacentGenre = (
  currentGenre: string,
  direction: GenreWheelDirection,
): string => {
  const currentIndex = Math.max(0, GENRES.indexOf(currentGenre));
  const nextIndex =
    (currentIndex + direction + GENRES.length) % GENRES.length;
  return GENRES[nextIndex] ?? GENRES[0] ?? currentGenre;
};

const getStageRank = (stage: SetupActiveStage): number =>
  stage === "genre" ? 0 : stage === "style" ? 1 : 2;

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

type LengthCycleWheelProps = {
  value: SceneLengthValue;
  disabled?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: SceneLengthValue) => void;
};

const LENGTH_TICK_DURATION_MS = 240;
const GENRE_TICK_DURATION_MS = 220;
const WHEEL_DRAG_STEP_PX = 26;

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
  const [direction, setDirection] = useState<GenreWheelDirection>(1);
  const [isDragging, setIsDragging] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pointerStateRef = useRef<WheelPointerState>({
    pointerId: null,
    lastY: 0,
    carryY: 0,
    moved: false,
  });

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

  const stepLength = useCallback(
    (stepDirection: GenreWheelDirection) => {
      if (disabled) return;
      const baseValue = nextValue ?? currentValue;
      const nextLength =
        stepDirection === 1
          ? getNextLengthValue(baseValue)
          : getAdjacentLengthValue(baseValue, -1);
      setDirection(stepDirection);
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
    },
    [
      clearScheduledAnimation,
      currentValue,
      disabled,
      nextValue,
      onChange,
      prefersReducedMotion,
    ],
  );

  const resetPointerState = useCallback(() => {
    const pointerId = pointerStateRef.current.pointerId;
    if (
      pointerId !== null &&
      buttonRef.current &&
      typeof buttonRef.current.releasePointerCapture === "function" &&
      buttonRef.current.hasPointerCapture(pointerId)
    ) {
      buttonRef.current.releasePointerCapture(pointerId);
    }
    pointerStateRef.current = {
      pointerId: null,
      lastY: 0,
      carryY: 0,
      moved: false,
    };
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        lastY: event.clientY,
        carryY: 0,
        moved: false,
      };
      suppressClickRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsDragging(true);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      const delta = event.clientY - pointerStateRef.current.lastY;
      pointerStateRef.current.lastY = event.clientY;
      pointerStateRef.current.carryY += delta;

      let didStep = false;
      while (pointerStateRef.current.carryY >= WHEEL_DRAG_STEP_PX) {
        pointerStateRef.current.carryY -= WHEEL_DRAG_STEP_PX;
        pointerStateRef.current.moved = true;
        didStep = true;
        stepLength(1);
      }
      while (pointerStateRef.current.carryY <= -WHEEL_DRAG_STEP_PX) {
        pointerStateRef.current.carryY += WHEEL_DRAG_STEP_PX;
        pointerStateRef.current.moved = true;
        didStep = true;
        stepLength(-1);
      }

      if (didStep) {
        suppressClickRef.current = true;
      }
    },
    [disabled, stepLength],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      suppressClickRef.current = pointerStateRef.current.moved;
      resetPointerState();
    },
    [resetPointerState],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }
      stepLength(1);
    },
    [stepLength],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowRight" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        stepLength(1);
        return;
      }
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft" ||
        event.key === "PageUp"
      ) {
        event.preventDefault();
        stepLength(-1);
      }
    },
    [disabled, stepLength],
  );

  const isAnimating = !prefersReducedMotion && phase !== "idle" && nextValue !== null;
  const incomingValue = nextValue ?? currentValue;
  const outgoingShiftClass =
    direction === 1
      ? phase === "animate"
        ? "-translate-y-[8px] opacity-0"
        : "translate-y-0 opacity-100"
      : phase === "animate"
        ? "translate-y-[8px] opacity-0"
        : "translate-y-0 opacity-100";
  const incomingShiftClass =
    direction === 1
      ? phase === "animate"
        ? "translate-y-0 opacity-100"
        : "translate-y-[8px] opacity-0"
      : phase === "animate"
        ? "translate-y-0 opacity-100"
        : "-translate-y-[8px] opacity-0";

  return (
    <button
      ref={buttonRef}
      type="button"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={handleClick}
      disabled={disabled}
      data-testid="setup-length-wheel"
      className={`inline-flex min-w-[7.9rem] items-center justify-between gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-slate-100 transition-[transform,box-shadow,border-color,background-color] duration-[220ms] ease-out ${focusRingClass} ${
        isDragging
          ? "border-indigo-300/55 bg-indigo-500/14 shadow-[0_18px_32px_-24px_rgba(99,102,241,0.65)]"
          : "hover:-translate-y-px hover:border-indigo-200/35 hover:bg-white/[0.05]"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "touch-none select-none"}`}
      aria-label={`Scene length: ${incomingValue}. Click to cycle or drag vertically.`}
      title="Click to cycle scene length. Drag vertically to step through lengths."
    >
      <span className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
        Length
      </span>
      <span
        className="relative inline-flex h-[1.25rem] min-w-[4.4rem] flex-1 overflow-hidden align-middle text-right"
        data-testid="setup-length-value-viewport"
      >
        {isAnimating && (
          <span
            className={`absolute inset-0 flex items-center justify-end leading-none transition-[opacity,transform] duration-[240ms] ease-in-out ${outgoingShiftClass}`}
          >
            {currentValue}
          </span>
        )}
        <span
          data-testid="setup-length-value"
          className={`absolute inset-0 flex items-center justify-end leading-none ${
            isAnimating
              ? `transition-[opacity,transform] duration-[240ms] ease-in-out ${incomingShiftClass}`
              : "opacity-100"
          }`}
        >
          {incomingValue}
        </span>
      </span>
    </button>
  );
};

type GenreCycleWheelProps = {
  value: string;
  disabled?: boolean;
  compact?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: string) => void;
};

const GenreCycleWheel: React.FC<GenreCycleWheelProps> = ({
  value,
  disabled = false,
  compact = false,
  prefersReducedMotion,
  focusRingClass,
  onChange,
}) => {
  const [currentValue, setCurrentValue] = useState(value);
  const [nextValue, setNextValue] = useState<string | null>(null);
  const [phase, setPhase] = useState<LengthTickPhase>("idle");
  const [direction, setDirection] = useState<GenreWheelDirection>(1);
  const [isDragging, setIsDragging] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const pointerStateRef = useRef<WheelPointerState>({
    pointerId: null,
    lastY: 0,
    carryY: 0,
    moved: false,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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

  const stepGenre = useCallback(
    (stepDirection: GenreWheelDirection) => {
      if (disabled) return;
      const baseValue = nextValue ?? currentValue;
      const nextGenre = getAdjacentGenre(baseValue, stepDirection);
      setDirection(stepDirection);
      onChange(nextGenre);

      if (prefersReducedMotion) {
        clearScheduledAnimation();
        setCurrentValue(nextGenre);
        setNextValue(null);
        setPhase("idle");
        return;
      }

      clearScheduledAnimation();
      setNextValue(nextGenre);
      setPhase("prep");

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setPhase("animate");
      });

      timeoutRef.current = window.setTimeout(() => {
        setCurrentValue(nextGenre);
        setNextValue(null);
        setPhase("idle");
        timeoutRef.current = null;
      }, GENRE_TICK_DURATION_MS);
    },
    [
      clearScheduledAnimation,
      currentValue,
      disabled,
      nextValue,
      onChange,
      prefersReducedMotion,
    ],
  );

  const resetPointerState = useCallback(() => {
    const pointerId = pointerStateRef.current.pointerId;
    if (
      pointerId !== null &&
      buttonRef.current &&
      typeof buttonRef.current.releasePointerCapture === "function" &&
      buttonRef.current.hasPointerCapture(pointerId)
    ) {
      buttonRef.current.releasePointerCapture(pointerId);
    }
    pointerStateRef.current = {
      pointerId: null,
      lastY: 0,
      carryY: 0,
      moved: false,
    };
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        lastY: event.clientY,
        carryY: 0,
        moved: false,
      };
      suppressClickRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsDragging(true);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      const delta = event.clientY - pointerStateRef.current.lastY;
      pointerStateRef.current.lastY = event.clientY;
      pointerStateRef.current.carryY += delta;

      let didStep = false;
      while (pointerStateRef.current.carryY >= WHEEL_DRAG_STEP_PX) {
        pointerStateRef.current.carryY -= WHEEL_DRAG_STEP_PX;
        pointerStateRef.current.moved = true;
        didStep = true;
        stepGenre(1);
      }
      while (pointerStateRef.current.carryY <= -WHEEL_DRAG_STEP_PX) {
        pointerStateRef.current.carryY += WHEEL_DRAG_STEP_PX;
        pointerStateRef.current.moved = true;
        didStep = true;
        stepGenre(-1);
      }

      if (didStep) {
        suppressClickRef.current = true;
      }
    },
    [disabled, stepGenre],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      suppressClickRef.current = pointerStateRef.current.moved;
      resetPointerState();
    },
    [resetPointerState],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }
      stepGenre(1);
    },
    [stepGenre],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowRight" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        stepGenre(1);
        return;
      }
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft" ||
        event.key === "PageUp"
      ) {
        event.preventDefault();
        stepGenre(-1);
      }
    },
    [disabled, stepGenre],
  );

  const isAnimating =
    !prefersReducedMotion && phase !== "idle" && nextValue !== null;
  const incomingValue = nextValue ?? currentValue;
  const isLarge = !compact;
  const outgoingShiftClass =
    direction === 1
      ? phase === "animate"
        ? "-translate-y-[12px] opacity-0"
        : "translate-y-0 opacity-100"
      : phase === "animate"
        ? "translate-y-[12px] opacity-0"
        : "translate-y-0 opacity-100";
  const incomingShiftClass =
    direction === 1
      ? phase === "animate"
        ? "translate-y-0 opacity-100"
        : "translate-y-[12px] opacity-0"
      : phase === "animate"
        ? "translate-y-0 opacity-100"
        : "-translate-y-[12px] opacity-0";

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={compact ? "setup-genre-wheel-compact" : "setup-genre-wheel"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-[22px] border border-indigo-200/25 bg-white/[0.03] text-left text-slate-100 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.9)] transition-[transform,box-shadow,border-color,background-color] duration-[240ms] ease-out ${focusRingClass} ${
        isLarge
          ? "w-full min-w-[13.5rem] max-w-[18rem] px-4 py-3 sm:min-w-[15.5rem] sm:px-5 sm:py-4"
          : "min-w-[7.75rem] max-w-[10.5rem] px-2.5 py-1.5"
      } ${
        isDragging
          ? "border-indigo-300/55 bg-indigo-500/16 shadow-[0_22px_46px_-28px_rgba(99,102,241,0.6)]"
          : "hover:-translate-y-px hover:border-indigo-200/40 hover:bg-white/[0.045]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "touch-none select-none"}`}
      aria-label={`Genre: ${incomingValue}. Click to cycle or drag vertically.`}
      aria-roledescription="genre wheel"
      title="Click to cycle genre. Drag vertically to step through genres."
      >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <span
        className={`block ${isLarge ? "text-[10px]" : "text-[9px]"} uppercase tracking-[0.34em] text-indigo-100/58`}
      >
        Genre
      </span>
      <span
        className={`relative mt-1.5 inline-flex overflow-hidden align-middle ${
          isLarge
            ? "h-[3.2rem] min-w-[9.5rem] w-full max-w-full"
            : "h-[1.7rem] min-w-[6.25rem] w-full max-w-full"
        }`}
        data-testid="setup-genre-value-viewport"
      >
        {isAnimating && (
          <span
            className={`absolute inset-0 flex items-center font-semibold leading-none transition-[opacity,transform] duration-[220ms] ease-in-out ${
              isLarge ? "whitespace-nowrap text-[2rem] sm:text-[2.3rem]" : "whitespace-nowrap text-[1.25rem]"
            } ${outgoingShiftClass}`}
          >
            {currentValue}
          </span>
        )}
        <span
          data-testid="setup-genre-value"
          className={`absolute inset-0 flex items-center font-semibold leading-none ${
            isLarge ? "whitespace-nowrap text-[2rem] sm:text-[2.3rem]" : "whitespace-nowrap text-[1.25rem]"
          } ${
            isAnimating
              ? `transition-[opacity,transform] duration-[220ms] ease-in-out ${incomingShiftClass}`
              : "opacity-100"
          }`}
        >
          {incomingValue}
        </span>
      </span>
      {isLarge && (
        <span className="mt-1 block text-xs text-slate-400 sm:text-sm">
          Click to cycle. Hold and drag vertically to step.
        </span>
      )}
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
  const {
    characterVoicePreferences = [],
    narratorVoicePreference = DEFAULT_NARRATOR_VOICE_PREFERENCE,
  } = value;
  const [isSurprising, setIsSurprising] = useState(false);
  const [justSurprised, setJustSurprised] = useState(false);
  const [activeStage, setActiveStage] = useState<SetupActiveStage>(() =>
    deriveInitialStage({ premise, characters, style, styleId }),
  );
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
  const cycleCharacterVoicePreference = (index: number) => {
    const nextPreferences = synchronizeSetupVoicePreferences({
      characters,
      characterVoicePreferences,
      narratorVoicePreference,
    }).characterVoicePreferences;
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

  const revealAiDetails = useCallback(() => {
    if (activeStage === "details") {
      setDetailRevealSource("ai");
    } else {
      setPendingDetailReveal(true);
    }
  }, [activeStage]);

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
    setActiveStage("details");
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
    const derivedStage = deriveInitialStage({ premise, characters, style, styleId });
    setActiveStage((previousStage) =>
      getStageRank(derivedStage) > getStageRank(previousStage)
        ? derivedStage
        : previousStage,
    );
  }, [characters, premise, style, styleId]);
  useEffect(() => {
    if (!pendingDetailReveal) return;
    const hasPremise = premise.trim().length > 0;
    const hasCharacter = characters.some((char) => char.trim().length > 0);
    if (!hasPremise || !hasCharacter) return;
    setActiveStage("details");
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
  const detailPanelClass = "space-y-2.5";
  const setupSectionLabelClass = setupUi.sectionLabel;
  const setupBodyTextClass = setupUi.bodyText;
  const setupBodyMutedTextClass = setupUi.bodyMutedText;
  const setupMetaTextClass = setupUi.metaText;
  const setupActionButtonBaseClass = `w-full py-3.5 sm:py-4 ${setupUi.buttonText} transition-[opacity,transform,box-shadow] duration-[220ms] ease-out hover:-translate-y-px active:duration-[140ms] active:ease-in-out active:translate-y-px text-center rounded-xl`;
  const styleActionButtonBaseClass = `rounded-lg px-3 py-2 ${setupUi.buttonText} ring-1 ${interactiveControlClass}`;
  const styleCardPulseClass = styleShufflePulse
    ? "shadow-[0_14px_34px_-26px_rgba(129,140,248,0.85)]"
    : "shadow-none";
  const stageShellClass =
    "rounded-[26px] border border-white/10 bg-slate-950/55 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.92)]";
  const summaryCardClass =
    "rounded-[20px] border border-white/10 bg-white/[0.025] px-3 py-1.5 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.95)] transition-[border-color,background-color,box-shadow,transform] duration-[240ms] ease-out";
  const compactActionButtonClass = `rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ${interactiveControlClass}`;
  const handleGenreAdvance = useCallback(() => {
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
        className={`inline-flex h-11 min-w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-900/70 px-2 text-slate-200 transition-[opacity,color,border-color,background-color,box-shadow] duration-[220ms] ease-out hover:border-indigo-300/55 hover:bg-indigo-500/18 hover:text-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
          isLocked ? "opacity-60 cursor-not-allowed" : ""
        } ${options?.narrator ? "border-white/12 bg-white/[0.035]" : ""}`}
      >
        <span className="text-[9px] uppercase tracking-[0.16em] text-slate-400">
          Voice
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold leading-none text-slate-100">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
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
          <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-2.5">
            {!isGenreStage && (
              <div
                className={`grid gap-2.5 transition-[transform,opacity] duration-[260ms] ease-out ${
                  isDetailsStage ? "md:grid-cols-2" : "max-w-md"
                }`}
              >
                <div
                  className={`${summaryCardClass} ${styleCardMotionClass}`}
                  data-testid="setup-genre-summary"
                >
                  <p className={`${setupSectionLabelClass} text-slate-400`}>
                    Selected genre
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <GenreCycleWheel
                      value={genre}
                      disabled={isLocked}
                      compact
                      prefersReducedMotion={prefersReducedMotion}
                      focusRingClass={focusRingClass}
                      onChange={handleGenreChange}
                    />
                    {isStyleStage && (
                      <button
                        type="button"
                        onClick={() => setActiveStage("genre")}
                        disabled={isLocked}
                        className={`${compactActionButtonClass} ${
                          isLocked
                            ? "cursor-not-allowed bg-white/[0.04] text-slate-400 ring-white/10 opacity-60"
                            : "bg-white/[0.04] text-slate-200 ring-white/12 hover:bg-white/[0.08]"
                        }`}
                      >
                        Focus
                      </button>
                    )}
                  </div>
                </div>

                {isDetailsStage && (
                  <div
                    className={`group ${summaryCardClass} ${styleCardMotionClass} ${styleCardPulseClass}`}
                    aria-live="polite"
                    data-testid="setup-style-summary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`${setupSectionLabelClass} text-slate-400`}>
                          Selected style
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-100">
                            {styleSummaryLabel}
                          </p>
                          {selectedStyleCategoryLabel && (
                            <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300 ring-1 ring-white/10">
                              {selectedStyleCategoryLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isStyleBlank && (
                        <button
                          type="button"
                          onClick={handleClearStyle}
                          disabled={isLocked}
                          aria-label="Clear selected style"
                          className={`${compactActionButtonClass} ${
                            isLocked
                              ? "cursor-not-allowed bg-white/[0.04] text-slate-400 ring-white/10 opacity-60"
                              : "bg-white/[0.04] text-slate-200 ring-white/12 hover:bg-white/[0.08]"
                          }`}
                          title="Clear selected style"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {!isDetailsStage && (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                        {styleSummaryDescription}
                      </p>
                    )}
                    <div className={`${isDetailsStage ? "mt-2" : "mt-2.5"} flex flex-wrap gap-2`}>
                      <button
                        type="button"
                        onClick={handleStyleShuffle}
                        disabled={isLocked || stylesLibrary.length === 0}
                        className={`${compactActionButtonClass} ${
                          isLocked || stylesLibrary.length === 0
                            ? "cursor-not-allowed bg-indigo-500/10 text-slate-400 ring-indigo-200/20 opacity-60"
                            : "bg-indigo-500/18 text-indigo-100 ring-indigo-200/35 hover:bg-indigo-500/24"
                        }`}
                      >
                        Shuffle
                      </button>
                      <button
                        type="button"
                        onClick={openStyleLibrary}
                        disabled={isLocked}
                        className={`inline-flex items-center gap-1.5 ${compactActionButtonClass} ${
                          isLocked
                            ? "cursor-not-allowed bg-indigo-500/10 text-slate-400 ring-indigo-200/20 opacity-60"
                            : "bg-indigo-500/18 text-indigo-100 ring-indigo-200/35 hover:bg-indigo-500/24"
                        }`}
                        aria-haspopup="dialog"
                        aria-expanded={isStyleLibraryOpen}
                      >
                        <Search className="h-3 w-3" />
                        Browse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isGenreStage && (
              <div className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_auto] lg:items-center">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className={setupSectionLabelClass}>Step 1</p>
                      <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                        Start with a genre
                      </h3>
                      <p className={setupBodyMutedTextClass}>
                        Keep one decision in front of you. Click to step
                        forward, or hold and drag vertically for a slot-style
                        scrub.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenreAdvance}
                      disabled={isLocked}
                      data-testid="setup-continue-to-style"
                      className={`${setupActionButtonBaseClass} ${focusRingClass} max-w-xs ${
                        isLocked
                          ? "cursor-not-allowed bg-indigo-500/12 text-slate-400 opacity-60"
                          : "bg-indigo-600 text-white ring-1 ring-indigo-400/50 shadow-[0_12px_24px_-8px_rgba(99,102,241,0.55)] hover:bg-indigo-500"
                      }`}
                    >
                      Continue to Style
                    </button>
                  </div>
                  <div className="flex justify-start lg:justify-end">
                    <GenreCycleWheel
                      value={genre}
                      disabled={isLocked}
                      prefersReducedMotion={prefersReducedMotion}
                      focusRingClass={focusRingClass}
                      onChange={handleGenreChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {isStyleStage && (
              <div className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className={setupSectionLabelClass}>Step 2</p>
                    <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                      Shape the tone
                    </h3>
                    <p className={setupBodyMutedTextClass}>
                      Style stays optional. Pick a vibe if it helps, then move
                      straight into premise and cast.
                    </p>
                  </div>
                  <div
                    className={`group rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3.5 sm:px-5 sm:py-4 ${styleCardMotionClass} ${styleCardPulseClass}`}
                    aria-live="polite"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`${setupSectionLabelClass} text-slate-400`}>
                          Selected style
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <p className="text-xl font-semibold leading-tight text-slate-100">
                            {styleSummaryLabel}
                          </p>
                          {selectedStyleCategoryLabel && (
                            <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300 ring-1 ring-white/12">
                              {selectedStyleCategoryLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isStyleBlank && (
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
                      )}
                    </div>

                    {selectedLibraryStyle ? (
                      <div className="mt-2.5 grid gap-3 lg:grid-cols-[minmax(0,0.94fr)_minmax(12.5rem,0.66fr)]">
                        <p className={`${setupBodyTextClass} leading-relaxed`}>
                          {selectedLibraryStyle.description}
                        </p>
                        <div className="rounded-[18px] border border-white/10 bg-slate-950/55 px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Sample line
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-slate-200">
                            {selectedLibraryStyle.sampleLine}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={`${setupBodyTextClass} mt-2.5`}>
                        {styleSummaryDescription}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
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
                        onClick={openStyleLibrary}
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

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void handleGenerateSurpriseSetup("manual");
                      }}
                      className={`${setupActionButtonBaseClass} ${focusRingClass} !bg-indigo-500/15 hover:!bg-indigo-500/25 !border-indigo-500/30 text-indigo-100`}
                      type="button"
                      loading={isSurprising}
                      disabled={isLoading || isSurprising || isLocked}
                    >
                      Generate AI Premise
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={showManualDetails}
                      className={`${setupActionButtonBaseClass} ${focusRingClass} !bg-slate-800/50 hover:!bg-slate-700/50 !border-white/10 text-slate-300`}
                      type="button"
                      disabled={isLocked}
                    >
                      Write My Own Premise
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {showDetails && (
              <div
                className={`${stageShellClass} space-y-3.5 px-5 py-4 sm:px-6 sm:py-4`}
              >
                <div className="space-y-1.5">
                  <p className={setupSectionLabelClass}>Step 3</p>
                  <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    Build the opening spark
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-300/85">
                    Premise leads while characters stay close at hand.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(17.25rem,0.8fr)] md:items-stretch">
                  <div
                    className={`${detailPanelClass} flex h-full flex-col rounded-[22px] border border-white/10 bg-slate-950/50 px-4 py-3.5 shadow-[0_16px_36px_-32px_rgba(15,23,42,0.9)]`}
                    data-testid="setup-premise-panel"
                  >
                    <label className={setupSectionLabelClass}>
                      Premise
                    </label>
                    <div className="flex flex-1 flex-col gap-2">
                      <textarea
                        rows={6}
                        value={premise}
                        onChange={(e) => updateValue({ premise: e.target.value })}
                        className={`w-full flex-1 min-h-[152px] resize-none rounded-[18px] border border-white/8 px-4 py-3.5 pr-3 !bg-slate-950/90 !text-slate-100 caret-indigo-200 placeholder:!text-slate-500 selection:bg-indigo-500/35 selection:text-white focus:outline-none transition-[border-color,background-color,box-shadow] duration-[220ms] ease-out text-[15px] sm:text-base leading-relaxed [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.32)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/45 ${
                          justSurprised
                            ? "!bg-slate-950/95 border-indigo-400/30 shadow-[0_0_0_1px_rgba(99,102,241,0.08),0_0_18px_rgba(99,102,241,0.12)]"
                            : "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        } ${isLocked ? "opacity-60 cursor-not-allowed !bg-slate-950/80 !text-slate-400" : ""}`}
                        placeholder="e.g., A detective discovers his new partner is a ghost..."
                        disabled={isLocked}
                      />
                      {detailRevealSource === "manual" && (
                        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {STARTER_IDEAS.map((idea) => (
                            <button
                              key={idea}
                              type="button"
                              onClick={() => handleStarterIdeaClick(idea)}
                              disabled={isLocked}
                              className="max-w-[13rem] shrink-0 text-left text-xs sm:text-sm text-slate-300 hover:text-indigo-100 bg-slate-900/65 hover:bg-indigo-500/20 rounded-full px-3 py-2 transition-[opacity,color,background-color] duration-[220ms] ease-out cursor-pointer border border-white/10 hover:border-indigo-300/50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {idea}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`${detailPanelClass} flex h-full flex-col rounded-[22px] border border-white/10 bg-slate-950/42 px-4 py-3.5 shadow-[0_12px_30px_-34px_rgba(15,23,42,0.8)]`}
                    data-testid="setup-characters-panel"
                  >
                    <div className="flex h-full flex-1 flex-col space-y-1.5">
                      <label className={`${setupSectionLabelClass} flex items-center gap-2`}>
                        <Users className="w-3.5 h-3.5 text-indigo-300" /> Characters
                      </label>
                      <div className="min-h-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex min-h-[42px] flex-1 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm sm:text-base font-medium text-white">
                                Narrator
                              </p>
                              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                                Built in
                              </p>
                            </div>
                          </div>
                          {renderVoicePreferenceButton(
                            narratorVoicePreference,
                            cycleNarratorVoicePreference,
                            {
                              testId: "setup-narrator-preference",
                              narrator: true,
                            },
                          )}
                        </div>
                        {characters.map((char, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              ref={(el) => {
                                characterInputs.current[idx] = el;
                              }}
                              value={char}
                              onChange={(e) =>
                                handleCharacterChange(idx, e.target.value)
                              }
                              className={`w-full rounded-xl border px-3 py-2.5 text-white text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 transition-[background-color,border-color,box-shadow] duration-[220ms] ease-out ${
                                justSurprised
                                  ? "bg-indigo-900/25 border-indigo-400/45"
                                  : "bg-slate-900/70 border-white/10"
                              } ${isLocked ? "opacity-60 cursor-not-allowed bg-slate-900/60 text-slate-400" : ""}`}
                              placeholder={`Character ${idx + 1}`}
                              disabled={isLocked}
                            />
                            {renderVoicePreferenceButton(
                              synchronizeSetupVoicePreferences({
                                characters,
                                characterVoicePreferences,
                                narratorVoicePreference,
                              }).characterVoicePreferences[idx] ??
                                DEFAULT_CHARACTER_VOICE_PREFERENCE,
                              () => cycleCharacterVoicePreference(idx),
                              {
                                testId: `setup-character-preference-${idx}`,
                              },
                            )}
                            {characters.length > 1 && !isLocked && (
                              <button
                                type="button"
                                onClick={() => removeCharacter(idx)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-[opacity,color,border-color,background-color] duration-200 hover:border-red-300/35 hover:bg-red-500/10 hover:text-red-300"
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
                          className="w-full py-2.5 rounded-xl text-slate-300 hover:text-indigo-200 text-sm font-medium transition-[opacity,color,border-color,box-shadow] duration-[220ms] ease-out flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 border border-dashed border-white/18 hover:border-indigo-300/55 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Character
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-3">
                  <div className="flex flex-wrap items-start justify-between gap-2.5 text-sm text-slate-400 sm:items-center">
                    <LengthCycleWheel
                      value={normalizedLength}
                      disabled={isLocked}
                      prefersReducedMotion={prefersReducedMotion}
                      focusRingClass={focusRingClass}
                      onChange={(nextLength) => updateValue({ length: nextLength })}
                    />
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.025] px-3 py-1.5">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Cast
                      </span>
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
              </div>
            )}
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
        </>
      )}
    </div>
  );
};
