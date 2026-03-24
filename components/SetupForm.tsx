import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { AnimatePresence, LayoutGroup, animate, useMotionValue } from "motion/react";
import * as m from "motion/react-m";
import { GENRES } from "../types";
import { Button } from "./Button";
import { Users, Plus, Search, Trash2, X, Mars, Venus, Shuffle } from "lucide-react";
import { STYLE_CATEGORIES, stylesLibrary } from "../stylesLibrary";
import {
  modalVariants,
  overlayVariants,
  stageShellVariants,
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
type GenreWheelPointerState = {
  pointerId: number | null;
  startY: number;
  lastY: number;
  lastTime: number;
  dragOffset: number;
  velocityY: number;
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

const getGenreByOffset = (currentGenre: string, offset: number): string => {
  if (GENRES.length === 0) return currentGenre;
  const currentIndex = Math.max(0, GENRES.indexOf(currentGenre));
  const nextIndex =
    (currentIndex + offset + GENRES.length * Math.max(1, Math.abs(offset))) %
    GENRES.length;
  return GENRES[nextIndex] ?? GENRES[0] ?? currentGenre;
};

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

type LengthCycleWheelProps = {
  value: SceneLengthValue;
  disabled?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: SceneLengthValue) => void;
};

const LENGTH_TICK_DURATION_MS = 240;
const WHEEL_DRAG_STEP_PX = 26;
const GENRE_WHEEL_STEP_SPRING = {
  type: "spring" as const,
  stiffness: 500,
  damping: 40,
  mass: 0.78,
  restSpeed: 0.4,
  restDelta: 0.4,
};
const GENRE_WHEEL_RETURN_SPRING = {
  type: "spring" as const,
  stiffness: 460,
  damping: 38,
  mass: 0.82,
  restSpeed: 0.4,
  restDelta: 0.4,
};
const GENRE_WHEEL_DRAG_CLICK_SLOP_PX = 6;
const GENRE_WHEEL_WINDOW_RADIUS = 3;
const GENRE_WHEEL_MOMENTUM_VELOCITY_CLAMP = 1.4;

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
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [phase, setPhase] = useState<LengthTickPhase>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [renderOffset, setRenderOffset] = useState(0);
  const suppressClickRef = useRef(false);
  const currentValueRef = useRef(value);
  const pendingValueRef = useRef<string | null>(null);
  const animationIdRef = useRef(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const pointerStateRef = useRef<GenreWheelPointerState>({
    pointerId: null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    dragOffset: 0,
    velocityY: 0,
    moved: false,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wheelMetrics = useMemo(() => {
    const itemHeight = compact ? 30 : 46;
    const peek = compact ? 8 : 12;
    return {
      itemHeight,
      peek,
      viewportHeight: itemHeight + peek * 2,
      baseTrackY: peek - itemHeight * GENRE_WHEEL_WINDOW_RADIUS,
      momentumActivationSteps: compact ? 0.9 : 1.1,
      momentumCarrySteps: compact ? 0.45 : 0.55,
      maxMomentumCarrySteps: compact ? 2.5 : 3.5,
      minOpacity: compact ? 0.2 : 0.16,
      minScale: compact ? 0.72 : 0.68,
    };
  }, [compact]);
  const wheelOffset = useMotionValue(0);

  const stopTrackAnimation = useCallback(() => {
    animationIdRef.current += 1;
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);

  useEffect(() => {
    pendingValueRef.current = pendingValue;
  }, [pendingValue]);

  useEffect(() => {
    return () => {
      stopTrackAnimation();
    };
  }, [stopTrackAnimation]);

  useEffect(() => {
    const unsubscribe = wheelOffset.on("change", (latest) => {
      setRenderOffset(latest);
    });
    return () => {
      unsubscribe();
    };
  }, [wheelOffset]);

  useEffect(() => {
    if (phase !== "idle" || isDragging) return;
    if (currentValueRef.current === value) return;
    stopTrackAnimation();
    setPendingValue(null);
    pendingValueRef.current = null;
    currentValueRef.current = value;
    setCurrentValue(value);
    wheelOffset.set(0);
  }, [isDragging, phase, stopTrackAnimation, value, wheelOffset]);

  useEffect(() => {
    if (phase !== "idle") return;
    wheelOffset.set(0);
  }, [phase, wheelOffset]);

  const completePendingStep = useCallback(() => {
    const resolvedValue = pendingValueRef.current;
    stopTrackAnimation();
    if (resolvedValue) {
      currentValueRef.current = resolvedValue;
      setCurrentValue(resolvedValue);
      setPendingValue(null);
      pendingValueRef.current = null;
    }
    setPhase("idle");
    wheelOffset.set(0);
  }, [stopTrackAnimation, wheelOffset]);

  const animateWheelOffset = useCallback(
    (
      targetOffset: number,
      transition: typeof GENRE_WHEEL_RETURN_SPRING,
      onComplete?: () => void,
    ) => {
      stopTrackAnimation();
      const animationId = animationIdRef.current;
      animationRef.current = animate(wheelOffset, targetOffset, {
        ...transition,
        onComplete: () => {
          if (animationIdRef.current !== animationId) return;
          animationRef.current = null;
          onComplete?.();
        },
      });
    },
    [stopTrackAnimation, wheelOffset],
  );

  const springTrackToCenter = useCallback((transition = GENRE_WHEEL_RETURN_SPRING) => {
    if (prefersReducedMotion) {
      stopTrackAnimation();
      wheelOffset.set(0);
      return;
    }
    animateWheelOffset(0, transition);
  }, [animateWheelOffset, prefersReducedMotion, stopTrackAnimation, wheelOffset]);

  const settleGenre = useCallback(
    (stepCount: number) => {
      if (disabled) return;
      if (stepCount === 0) {
        springTrackToCenter();
        return;
      }

      const baseValue = currentValueRef.current;
      const nextGenre = getGenreByOffset(baseValue, stepCount);
      onChange(nextGenre);

      if (prefersReducedMotion) {
        stopTrackAnimation();
        currentValueRef.current = nextGenre;
        setCurrentValue(nextGenre);
        setPendingValue(null);
        pendingValueRef.current = null;
        setPhase("idle");
        wheelOffset.set(0);
        return;
      }

      setPendingValue(nextGenre);
      pendingValueRef.current = nextGenre;
      setPhase("animate");
      animateWheelOffset(
        stepCount * wheelMetrics.itemHeight,
        GENRE_WHEEL_STEP_SPRING,
        () => {
          currentValueRef.current = nextGenre;
          setCurrentValue(nextGenre);
          setPendingValue(null);
          pendingValueRef.current = null;
          setPhase("idle");
          wheelOffset.set(0);
        },
      );
    },
    [
      animateWheelOffset,
      disabled,
      onChange,
      prefersReducedMotion,
      springTrackToCenter,
      stopTrackAnimation,
      wheelMetrics.itemHeight,
      wheelOffset,
    ],
  );

  const stepGenre = useCallback(
    (stepDirection: GenreWheelDirection) => {
      if (disabled) return;
      completePendingStep();
      settleGenre(stepDirection);
    },
    [completePendingStep, disabled, settleGenre],
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
      startY: 0,
      lastY: 0,
      lastTime: 0,
      dragOffset: 0,
      velocityY: 0,
      moved: false,
    };
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      completePendingStep();
      pointerStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        dragOffset: 0,
        velocityY: 0,
        moved: false,
      };
      suppressClickRef.current = false;
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsDragging(true);
    },
    [completePendingStep, disabled],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      const deltaY = event.clientY - pointerStateRef.current.lastY;
      const deltaTime = Math.max(
        event.timeStamp - pointerStateRef.current.lastTime,
        8,
      );
      const velocitySample = deltaY / deltaTime;
      pointerStateRef.current.velocityY =
        pointerStateRef.current.velocityY * 0.72 + velocitySample * 0.28;
      pointerStateRef.current.lastY = event.clientY;
      pointerStateRef.current.lastTime = event.timeStamp;
      const dragOffset = event.clientY - pointerStateRef.current.startY;
      pointerStateRef.current.dragOffset = dragOffset;
      if (Math.abs(dragOffset) >= GENRE_WHEEL_DRAG_CLICK_SLOP_PX) {
        pointerStateRef.current.moved = true;
        suppressClickRef.current = true;
      }
      if (prefersReducedMotion) return;
      wheelOffset.set(dragOffset);
    },
    [disabled, prefersReducedMotion, wheelOffset],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerStateRef.current.pointerId !== event.pointerId) return;
      const dragOffset = pointerStateRef.current.dragOffset;
      const velocityY = Math.max(
        -GENRE_WHEEL_MOMENTUM_VELOCITY_CLAMP,
        Math.min(
          pointerStateRef.current.velocityY,
          GENRE_WHEEL_MOMENTUM_VELOCITY_CLAMP,
        ),
      );
      suppressClickRef.current = pointerStateRef.current.moved;
      resetPointerState();
      if (event.type === "pointercancel") {
        springTrackToCenter();
        return;
      }
      if (prefersReducedMotion) {
        const reducedSteps = Math.round(dragOffset / wheelMetrics.itemHeight);
        if (reducedSteps === 0) {
          wheelOffset.set(0);
          return;
        }
        settleGenre(reducedSteps);
        return;
      }
      const dragSteps = dragOffset / wheelMetrics.itemHeight;
      const momentumWeight =
        Math.abs(dragSteps) >= wheelMetrics.momentumActivationSteps
          ? Math.min(Math.abs(dragSteps), 1.35)
          : 0;
      const momentumSteps = Math.max(
        -wheelMetrics.maxMomentumCarrySteps,
        Math.min(
          velocityY *
            wheelMetrics.momentumCarrySteps *
            momentumWeight,
          wheelMetrics.maxMomentumCarrySteps,
        ),
      );
      const snapSteps = Math.round(dragSteps + momentumSteps);
      if (snapSteps === 0) {
        springTrackToCenter();
        return;
      }
      settleGenre(snapSteps);
    },
    [
      prefersReducedMotion,
      resetPointerState,
      settleGenre,
      springTrackToCenter,
      wheelMetrics.itemHeight,
      wheelMetrics.momentumActivationSteps,
      wheelMetrics.maxMomentumCarrySteps,
      wheelMetrics.momentumCarrySteps,
      wheelOffset,
    ],
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

  const isLarge = !compact;
  const centeredStepOffset = Math.round(renderOffset / wheelMetrics.itemHeight);
  const normalizedRenderOffset =
    renderOffset - centeredStepOffset * wheelMetrics.itemHeight;
  const selectedValue =
    pendingValue ?? getGenreByOffset(currentValue, centeredStepOffset);
  const visibleItems = useMemo(
    () =>
      Array.from(
        { length: GENRE_WHEEL_WINDOW_RADIUS * 2 + 1 },
        (_, itemIndex) => {
          const relativeIndex = itemIndex - GENRE_WHEEL_WINDOW_RADIUS;
          return {
            relativeIndex,
            value: getGenreByOffset(
              currentValue,
              centeredStepOffset + relativeIndex,
            ),
          };
        },
      ),
    [centeredStepOffset, currentValue],
  );

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
      className={`group relative overflow-hidden text-left text-slate-100 transition-[transform,box-shadow,border-color,background-color,color] duration-[240ms] ease-out ${focusRingClass} ${
        isLarge
          ? "w-full min-w-[13.5rem] max-w-[18.5rem] rounded-[22px] border border-indigo-200/20 bg-white/[0.02] px-4 py-3 sm:min-w-[15.5rem] sm:px-5 sm:py-4 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.9)]"
          : "min-w-[8.25rem] max-w-[11rem] rounded-2xl border border-transparent bg-transparent px-0 py-0 shadow-none"
      } ${
        isDragging
          ? isLarge
            ? "border-indigo-300/45 bg-indigo-500/10 shadow-[0_22px_46px_-28px_rgba(99,102,241,0.45)]"
            : "text-indigo-100"
          : isLarge
            ? "hover:border-indigo-200/32 hover:bg-white/[0.03]"
          : "hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-60" : "touch-none select-none"}`}
      aria-label={`Genre: ${selectedValue}. Click to cycle or drag vertically.`}
      aria-roledescription="genre wheel"
      title="Click to cycle genre. Drag vertically to spin and release to glide."
      >
      {isLarge ? (
        <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      ) : null}
      {isLarge ? (
        <span className="block text-[10px] uppercase tracking-[0.34em] text-indigo-100/58">
          Genre
        </span>
      ) : null}
      <span
        className={`relative mt-1.5 block w-full overflow-hidden align-middle ${
          isLarge ? "min-w-[9.5rem] max-w-full" : "min-w-[6.5rem] max-w-full"
        }`}
        style={{
          height: wheelMetrics.viewportHeight,
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        }}
        data-testid="setup-genre-value-viewport"
        aria-hidden="true"
      >
        <span
          className="absolute inset-x-0 top-0 flex flex-col transform-gpu will-change-transform"
          style={{
            transform: `translateY(${wheelMetrics.baseTrackY - normalizedRenderOffset}px)`,
          }}
        >
          {visibleItems.map((item) => {
            const isSelectedItem = item.value === selectedValue;
            const distance = Math.abs(
              item.relativeIndex * wheelMetrics.itemHeight - normalizedRenderOffset,
            );
            const normalizedDistance = Math.min(
              distance / (wheelMetrics.itemHeight * 1.55),
              1,
            );
            const prominence = 1 - normalizedDistance;
            const easedProminence =
              prominence * prominence * (3 - 2 * prominence);
            const opacity =
              wheelMetrics.minOpacity +
              (1 - wheelMetrics.minOpacity) * easedProminence;
            const scale =
              wheelMetrics.minScale +
              (1 - wheelMetrics.minScale) * easedProminence;
            const lift = (1 - easedProminence) * (isLarge ? 1.6 : 0.8);
            const textShadowAlpha = 0.05 + easedProminence * 0.16;

            return (
                <span
                key={`${currentValue}-${centeredStepOffset}-${item.relativeIndex}-${item.value}`}
                data-testid={isSelectedItem ? "setup-genre-value" : undefined}
                className={`flex items-center font-semibold leading-none text-slate-50 ${
                  isLarge
                    ? "text-[2rem] sm:text-[2.3rem]"
                    : "text-[1.5rem] tracking-[-0.01em]"
                }`}
                style={{
                  height: wheelMetrics.itemHeight,
                  opacity,
                  transform: `translateY(${lift}px) scale(${scale})`,
                  transformOrigin: "center left",
                  textShadow: `0 0 18px rgba(255,255,255,${textShadowAlpha})`,
                }}
              >
                <span className="block w-full whitespace-nowrap">
                  {item.value}
                </span>
              </span>
            );
          })}
        </span>
      </span>
      {isLarge && (
        <span className="mt-1 block text-xs text-slate-400 sm:text-sm">
          Click to cycle. Drag vertically to spin and release to glide.
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
  const [manualPremiseDraft, setManualPremiseDraft] = useState(() => premise);
  const [aiPremiseDraft, setAiPremiseDraft] = useState("");
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
  const detailsFooterRef = useRef<HTMLDivElement | null>(null);

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

  const switchPremiseMode = useCallback(
    (nextMode: "manual" | "ai") => {
      if (isLocked || detailRevealSource === nextMode) return;
      setPendingDetailReveal(false);
      setActiveStage("details");
      setDetailRevealSource(nextMode);
      const nextPremise =
        nextMode === "manual"
          ? manualPremiseDraft.trim().length > 0
            ? manualPremiseDraft
            : premise
          : aiPremiseDraft.trim().length > 0
            ? aiPremiseDraft
            : premise;
      if (nextPremise !== premise) {
        updateValue({ premise: nextPremise });
      }
    },
    [
      aiPremiseDraft,
      detailRevealSource,
      isLocked,
      manualPremiseDraft,
      premise,
      updateValue,
    ],
  );

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
    if (activeStage === "details" && detailRevealSource === null) {
      setDetailRevealSource("manual");
    }
  }, [activeStage, detailRevealSource]);
  useEffect(() => {
    if (detailRevealSource === "manual") {
      setManualPremiseDraft(premise);
      return;
    }
    if (detailRevealSource === "ai") {
      setAiPremiseDraft(premise);
    }
  }, [detailRevealSource, premise]);
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
  const premiseMode = detailRevealSource ?? "manual";
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
  const setupActionButtonBaseClass = `w-full py-3.5 sm:py-4 ${setupUi.buttonText} transition-[opacity,transform,box-shadow,background-color] duration-[220ms] ease-out hover:-translate-y-px active:duration-[140ms] active:ease-in-out active:translate-y-px text-center rounded-xl`;
  const styleActionButtonBaseClass = `rounded-lg px-3 py-2 ${setupUi.buttonText} ring-1 ${interactiveControlClass}`;
  const styleCardPulseClass = styleShufflePulse
    ? "shadow-[0_14px_34px_-26px_rgba(129,140,248,0.85)]"
    : "shadow-none";
  const stageSurfaceBaseClass =
    "rounded-[24px] border border-white/10 ring-1 ring-white/5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.92)]";
  const stageShellClass = `${stageSurfaceBaseClass} bg-slate-950/56 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.92)]`;
  const summaryCardClass =
    `${stageSurfaceBaseClass} bg-white/[0.03] px-4 py-3.5 sm:px-5 sm:py-4 transition-[border-color,background-color,box-shadow,transform] duration-[240ms] ease-out`;
  const sharedSurfaceCardClass =
    `${stageSurfaceBaseClass} bg-white/[0.032] px-4 py-3.5 sm:px-5 sm:py-4`;
  const compactActionButtonClass = `rounded-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] ring-1 ${interactiveControlClass}`;
  const summaryLinkButtonClass = `inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${interactiveControlClass}`;
  const summaryStatusTextClass =
    "hidden text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:inline";
  const parkedRailClass = isDetailsStage
    ? "grid gap-3 md:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]"
    : "grid max-w-md gap-3";
  const detailSectionSurfaceClass =
    "flex h-full min-h-0 flex-col rounded-[20px] border border-white/8 bg-white/[0.028] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const detailsStageShellClass = `${stageShellClass} flex flex-col gap-3 overflow-hidden px-5 py-4 sm:px-6 sm:py-4 lg:max-h-[calc(100vh-23.5rem)]`;
  const genreSurfaceLayoutId = prefersReducedMotion
    ? undefined
    : "setup-genre-surface";
  const styleSurfaceLayoutId = prefersReducedMotion
    ? undefined
    : "setup-style-surface";
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
                      <div className="min-w-0">
                        <p className={`${setupSectionLabelClass} text-slate-400`}>
                          Selected genre
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
                          Opening lane locked in.
                        </p>
                      </div>
                      {isStyleStage && (
                        <button
                          type="button"
                          onClick={() => setActiveStage("genre")}
                          disabled={isLocked}
                          className={`${summaryLinkButtonClass} shrink-0 ${
                            isLocked
                              ? "cursor-not-allowed bg-white/[0.04] text-slate-400 opacity-60"
                              : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <GenreCycleWheel
                        value={genre}
                        disabled={isLocked}
                        compact
                        prefersReducedMotion={prefersReducedMotion}
                        focusRingClass={focusRingClass}
                        onChange={handleGenreChange}
                      />
                      <span className={summaryStatusTextClass}>
                        Step 1 complete
                      </span>
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
                                  : "bg-white/[0.035] text-slate-300 ring-white/10 hover:bg-white/[0.07] hover:text-white"
                              }`}
                              title="Clear selected style"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleStyleShuffle}
                            disabled={isLocked || stylesLibrary.length === 0}
                            className={`${compactActionButtonClass} ${
                              isLocked || stylesLibrary.length === 0
                                ? "cursor-not-allowed bg-white/[0.04] text-slate-400 ring-white/10 opacity-60"
                                : "bg-white/[0.035] text-slate-200 ring-white/12 hover:bg-white/[0.07] hover:text-white"
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
                                ? "cursor-not-allowed bg-white/[0.04] text-slate-400 ring-white/10 opacity-60"
                                : "bg-white/[0.035] text-slate-200 ring-white/12 hover:bg-white/[0.07] hover:text-white"
                            }`}
                            aria-haspopup="dialog"
                            aria-expanded={isStyleLibraryOpen}
                          >
                            <Search className="h-3 w-3" />
                            Browse
                          </button>
                        </div>
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                </m.div>
              )}
              <AnimatePresence initial={false} mode="wait">
              {isGenreStage ? (
                <m.div
                  key="setup-stage-genre"
                  layout="position"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={stageShellVariants}
                  className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}
                >
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
                      <m.div
                        layout
                        layoutId={genreSurfaceLayoutId}
                        className={`${sharedSurfaceCardClass} w-full max-w-[24rem]`}
                      >
                        <p className={`${setupSectionLabelClass} text-slate-400`}>
                          Selected genre
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <GenreCycleWheel
                            value={genre}
                            disabled={isLocked}
                            prefersReducedMotion={prefersReducedMotion}
                            focusRingClass={focusRingClass}
                            onChange={handleGenreChange}
                          />
                        </div>
                      </m.div>
                    </div>
                  </div>
                </m.div>
              ) : null}

              {isStyleStage ? (
                <m.div
                  key="setup-stage-style"
                  layout="position"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={stageShellVariants}
                  className={`${stageShellClass} px-5 py-5 sm:px-6 sm:py-5`}
                >
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
                    <m.div
                      layout
                      layoutId={styleSurfaceLayoutId}
                      className={`group ${sharedSurfaceCardClass} ${styleCardMotionClass} ${styleCardPulseClass}`}
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
                    </m.div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleGenerateSurpriseSetup("manual");
                        }}
                        disabled={isLoading || isSurprising || isLocked}
                        aria-busy={isSurprising || undefined}
                        aria-disabled={(isLoading || isSurprising || isLocked) || undefined}
                        className={`inline-flex items-center justify-center ${setupActionButtonBaseClass} ${focusRingClass} bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100 disabled:opacity-50 disabled:pointer-events-none`}
                      >
                        {isSurprising ? (
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        Generate AI Premise
                      </button>
                      <button
                        type="button"
                        onClick={showManualDetails}
                        disabled={isLocked}
                        aria-disabled={isLocked || undefined}
                        className={`inline-flex items-center justify-center ${setupActionButtonBaseClass} ${focusRingClass} bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 disabled:opacity-50 disabled:pointer-events-none`}
                      >
                        Write My Own Premise
                      </button>
                    </div>
                  </div>
                </m.div>
              ) : null}

              {showDetails ? (
                <m.div
                  key="setup-stage-details"
                  layout="position"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={stageShellVariants}
                  className={detailsStageShellClass}
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

                <m.div
                  layout="position"
                  className="grid grid-cols-1 gap-3 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1.2fr)_minmax(17.25rem,0.8fr)] md:items-stretch"
                >
                  <div
                    className={`${detailPanelClass} ${detailSectionSurfaceClass}`}
                    data-testid="setup-premise-panel"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <label className={setupSectionLabelClass}>
                        Premise
                      </label>
                      <div
                        role="group"
                        aria-label="Premise mode"
                        className="inline-flex rounded-full border border-white/10 bg-slate-950/70 p-1"
                      >
                        <button
                          type="button"
                          onClick={() => switchPremiseMode("ai")}
                          disabled={isLocked}
                          aria-pressed={premiseMode === "ai"}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,opacity] duration-[220ms] ease-out ${focusRingClass} ${
                            premiseMode === "ai"
                              ? "bg-indigo-500/20 text-indigo-100"
                              : "text-slate-300 hover:bg-white/[0.05] hover:text-slate-100"
                          } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          AI premise
                        </button>
                        <button
                          type="button"
                          onClick={() => switchPremiseMode("manual")}
                          disabled={isLocked}
                          aria-pressed={premiseMode === "manual"}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,opacity] duration-[220ms] ease-out ${focusRingClass} ${
                            premiseMode === "manual"
                              ? "bg-indigo-500/20 text-indigo-100"
                              : "text-slate-300 hover:bg-white/[0.05] hover:text-slate-100"
                          } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          Write my own
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      {premiseMode === "ai" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-2">
                          <p className="text-xs leading-relaxed text-slate-300/85">
                            Generate or refresh the premise from the current setup context.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              void handleGenerateSurpriseSetup("manual");
                            }}
                            disabled={isLoading || isSurprising || isLocked}
                            aria-busy={isSurprising || undefined}
                            aria-disabled={(isLoading || isSurprising || isLocked) || undefined}
                            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,opacity] duration-[220ms] ease-out ${focusRingClass} ${
                              isLoading || isSurprising || isLocked
                                ? "cursor-not-allowed bg-indigo-500/10 text-slate-300/70 opacity-60"
                                : "bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
                            }`}
                          >
                            {isSurprising
                              ? "Generating..."
                              : trimmedPremise
                                ? "Regenerate with AI"
                                : "Generate with AI"}
                          </button>
                        </div>
                      ) : null}
                      <textarea
                        rows={5}
                        value={premise}
                        onChange={(e) => {
                          const nextPremise = e.target.value;
                          if (premiseMode === "manual") {
                            setManualPremiseDraft(nextPremise);
                          } else {
                            setAiPremiseDraft(nextPremise);
                          }
                          updateValue({ premise: nextPremise });
                        }}
                        className={`w-full flex-1 min-h-[132px] resize-none rounded-[18px] border border-white/8 px-4 py-3.5 pr-3 !bg-slate-950/90 !text-slate-100 caret-indigo-200 placeholder:!text-slate-500 selection:bg-indigo-500/35 selection:text-white focus:outline-none transition-[border-color,background-color,box-shadow] duration-[220ms] ease-out text-[15px] sm:text-base leading-relaxed lg:min-h-[118px] [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.32)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/45 ${
                          justSurprised
                            ? "!bg-slate-950/95 border-indigo-400/30 shadow-[0_0_0_1px_rgba(99,102,241,0.08),0_0_18px_rgba(99,102,241,0.12)]"
                            : "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        } ${isLocked ? "opacity-60 cursor-not-allowed !bg-slate-950/80 !text-slate-400" : ""}`}
                        placeholder="e.g., A detective discovers his new partner is a ghost..."
                        disabled={isLocked}
                      />
                      {premiseMode === "manual" && (
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
                    className={`${detailPanelClass} ${detailSectionSurfaceClass}`}
                    data-testid="setup-characters-panel"
                  >
                    <div className="flex h-full flex-1 flex-col space-y-1.5">
                      <label className={`${setupSectionLabelClass} flex items-center gap-2`}>
                        <Users className="w-3.5 h-3.5 text-indigo-300" /> Characters
                      </label>
                      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.2)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/35">
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
                </m.div>

                <div
                  ref={detailsFooterRef}
                  className="mt-0.5 pt-1.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2.5 text-sm text-slate-400 sm:items-center">
                    <LengthCycleWheel
                      value={normalizedLength}
                      disabled={isLocked}
                      prefersReducedMotion={prefersReducedMotion}
                      focusRingClass={focusRingClass}
                      onChange={(nextLength) => updateValue({ length: nextLength })}
                    />
                    <div className="flex items-baseline gap-2">
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
                </m.div>
              ) : null}
              </AnimatePresence>
            </m.div>
          </LayoutGroup>

          <AnimatePresence initial={false}>
            {isStyleLibraryOpen ? (
              <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
                <m.div
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setIsStyleLibraryOpen(false)}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={overlayVariants}
                />
                <m.div
                  ref={styleLibraryModalRef}
                  className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-indigo-300/20 bg-slate-950 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Style Library"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={modalVariants}
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
                </m.div>
              </div>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
