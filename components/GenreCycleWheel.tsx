import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, useMotionValue } from "motion/react";
import { GENRES } from "../types";

type GenreWheelDirection = 1 | -1;
type GenreWheelPointerState = {
  pointerId: number | null;
  startY: number;
  lastY: number;
  lastTime: number;
  dragOffset: number;
  velocityY: number;
  moved: boolean;
};
type GenreWheelPhase = "idle" | "prep" | "animate";

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
const GENRE_WHEEL_METRICS = {
  regular: {
    itemHeight: 46,
    peek: 12,
    momentumActivationSteps: 1.1,
    momentumCarrySteps: 0.55,
    maxMomentumCarrySteps: 3.5,
    minOpacity: 0.16,
    minScale: 0.68,
  },
  compact: {
    itemHeight: 30,
    peek: 8,
    momentumActivationSteps: 0.9,
    momentumCarrySteps: 0.45,
    maxMomentumCarrySteps: 2.5,
    minOpacity: 0.2,
    minScale: 0.72,
  },
} as const;

const getGenreByOffset = (currentGenre: string, offset: number): string => {
  if (GENRES.length === 0) return currentGenre;
  const currentIndex = Math.max(0, GENRES.indexOf(currentGenre));
  const nextIndex =
    (currentIndex + offset + GENRES.length * Math.max(1, Math.abs(offset))) %
    GENRES.length;
  return GENRES[nextIndex] ?? GENRES[0] ?? currentGenre;
};

export type GenreCycleWheelProps = {
  value: string;
  disabled?: boolean;
  compact?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: string) => void;
};

export const GenreCycleWheel: React.FC<GenreCycleWheelProps> = ({
  value,
  disabled = false,
  compact = false,
  prefersReducedMotion,
  focusRingClass,
  onChange,
}) => {
  const [currentValue, setCurrentValue] = useState(value);
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [phase, setPhase] = useState<GenreWheelPhase>("idle");
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
    const metrics = compact
      ? GENRE_WHEEL_METRICS.compact
      : GENRE_WHEEL_METRICS.regular;
    const { itemHeight, peek } = metrics;
    return {
      itemHeight,
      peek,
      viewportHeight: itemHeight + peek * 2,
      baseTrackY: peek - itemHeight * GENRE_WHEEL_WINDOW_RADIUS,
      momentumActivationSteps: metrics.momentumActivationSteps,
      momentumCarrySteps: metrics.momentumCarrySteps,
      maxMomentumCarrySteps: metrics.maxMomentumCarrySteps,
      minOpacity: metrics.minOpacity,
      minScale: metrics.minScale,
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
      aria-label={`Genre: ${selectedValue}`}
      aria-roledescription="genre wheel"
      title="Genre"
    >
      {isLarge ? (
        <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      ) : null}
      <span
        className={`relative block w-full overflow-hidden align-middle ${
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
    </button>
  );
};
