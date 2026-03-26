import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, useMotionValue } from "motion/react";

export type SceneLengthValue = "Short" | "Medium" | "Long";
type LengthTickPhase = "idle" | "prep" | "animate";
type WheelDirection = 1 | -1;
type WheelPointerState = {
  pointerId: number | null;
  startY: number;
  lastY: number;
  lastTime: number;
  dragOffset: number;
  velocityY: number;
  moved: boolean;
};

const SCENE_LENGTH_VALUES: readonly SceneLengthValue[] = ["Short", "Medium", "Long"];
const LENGTH_WHEEL_DRAG_CLICK_SLOP_PX = 6;
const LENGTH_WHEEL_MOMENTUM_VELOCITY_CLAMP = 1.4;
const LENGTH_WHEEL_WINDOW_RADIUS = 1;
const LENGTH_WHEEL_STEP_SPRING = {
  type: "spring" as const,
  stiffness: 500,
  damping: 40,
  mass: 0.78,
  restSpeed: 0.4,
  restDelta: 0.4,
};
const LENGTH_WHEEL_RETURN_SPRING = {
  type: "spring" as const,
  stiffness: 460,
  damping: 38,
  mass: 0.82,
  restSpeed: 0.4,
  restDelta: 0.4,
};
const LENGTH_WHEEL_METRICS = {
  itemHeight: 26,
  viewportHeight: 20,
  momentumActivationSteps: 0.9,
  momentumCarrySteps: 0.2,
  maxMomentumCarrySteps: 0.55,
  minOpacity: 0.2,
  minScale: 0.78,
} as const;

export const normalizeLengthValue = (value: string): SceneLengthValue =>
  value === "Short" || value === "Long" ? value : "Medium";

const getLengthByOffset = (
  currentValue: SceneLengthValue,
  offset: number,
): SceneLengthValue => {
  const currentIndex = Math.max(0, SCENE_LENGTH_VALUES.indexOf(currentValue));
  const nextIndex =
    (currentIndex + offset + SCENE_LENGTH_VALUES.length * Math.max(1, Math.abs(offset))) %
    SCENE_LENGTH_VALUES.length;
  return SCENE_LENGTH_VALUES[nextIndex] ?? currentValue;
};

export type LengthCycleWheelProps = {
  value: SceneLengthValue;
  disabled?: boolean;
  prefersReducedMotion: boolean;
  focusRingClass: string;
  onChange: (nextValue: SceneLengthValue) => void;
};

export const LengthCycleWheel: React.FC<LengthCycleWheelProps> = ({
  value,
  disabled = false,
  prefersReducedMotion,
  focusRingClass,
  onChange,
}) => {
  const [currentValue, setCurrentValue] = useState<SceneLengthValue>(value);
  const [pendingValue, setPendingValue] = useState<SceneLengthValue | null>(null);
  const [phase, setPhase] = useState<LengthTickPhase>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [renderOffset, setRenderOffset] = useState(0);
  const suppressClickRef = useRef(false);
  const currentValueRef = useRef(value);
  const pendingValueRef = useRef<SceneLengthValue | null>(null);
  const animationIdRef = useRef(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pointerStateRef = useRef<WheelPointerState>({
    pointerId: null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    dragOffset: 0,
    velocityY: 0,
    moved: false,
  });
  const wheelMetrics = useMemo(() => {
    const { itemHeight, viewportHeight } = LENGTH_WHEEL_METRICS;
    return {
      itemHeight,
      viewportHeight,
      baseTrackY:
        -itemHeight * LENGTH_WHEEL_WINDOW_RADIUS +
        (viewportHeight - itemHeight) / 2,
      momentumActivationSteps: LENGTH_WHEEL_METRICS.momentumActivationSteps,
      momentumCarrySteps: LENGTH_WHEEL_METRICS.momentumCarrySteps,
      maxMomentumCarrySteps: LENGTH_WHEEL_METRICS.maxMomentumCarrySteps,
      minOpacity: LENGTH_WHEEL_METRICS.minOpacity,
      minScale: LENGTH_WHEEL_METRICS.minScale,
    };
  }, []);
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
      transition: typeof LENGTH_WHEEL_RETURN_SPRING,
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

  const springTrackToCenter = useCallback(
    (transition = LENGTH_WHEEL_RETURN_SPRING) => {
      if (prefersReducedMotion) {
        stopTrackAnimation();
        wheelOffset.set(0);
        return;
      }
      animateWheelOffset(0, transition);
    },
    [animateWheelOffset, prefersReducedMotion, stopTrackAnimation, wheelOffset],
  );

  const settleLength = useCallback(
    (stepCount: number) => {
      if (disabled) return;
      if (stepCount === 0) {
        springTrackToCenter();
        return;
      }

      const baseValue = currentValueRef.current;
      const nextLength = getLengthByOffset(baseValue, stepCount);
      onChange(nextLength);

      if (prefersReducedMotion) {
        stopTrackAnimation();
        currentValueRef.current = nextLength;
        setCurrentValue(nextLength);
        setPendingValue(null);
        pendingValueRef.current = null;
        setPhase("idle");
        wheelOffset.set(0);
        return;
      }

      setPendingValue(nextLength);
      pendingValueRef.current = nextLength;
      setPhase("animate");
      animateWheelOffset(
        stepCount * wheelMetrics.itemHeight,
        LENGTH_WHEEL_STEP_SPRING,
        () => {
          currentValueRef.current = nextLength;
          setCurrentValue(nextLength);
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

  const stepLength = useCallback(
    (stepDirection: WheelDirection) => {
      if (disabled) return;
      completePendingStep();
      settleLength(stepDirection);
    },
    [completePendingStep, disabled, settleLength],
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
      const deltaTime = Math.max(event.timeStamp - pointerStateRef.current.lastTime, 8);
      const velocitySample = deltaY / deltaTime;
      pointerStateRef.current.velocityY =
        pointerStateRef.current.velocityY * 0.72 + velocitySample * 0.28;
      pointerStateRef.current.lastY = event.clientY;
      pointerStateRef.current.lastTime = event.timeStamp;
      const dragOffset = event.clientY - pointerStateRef.current.startY;
      pointerStateRef.current.dragOffset = dragOffset;
      if (Math.abs(dragOffset) >= LENGTH_WHEEL_DRAG_CLICK_SLOP_PX) {
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
        -LENGTH_WHEEL_MOMENTUM_VELOCITY_CLAMP,
        Math.min(
          pointerStateRef.current.velocityY,
          LENGTH_WHEEL_MOMENTUM_VELOCITY_CLAMP,
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
        settleLength(reducedSteps);
        return;
      }
      const dragSteps = dragOffset / wheelMetrics.itemHeight;
      const momentumWeight =
        Math.abs(dragSteps) >= wheelMetrics.momentumActivationSteps
          ? Math.min(Math.abs(dragSteps), 1)
          : 0;
      const momentumSteps = Math.max(
        -wheelMetrics.maxMomentumCarrySteps,
        Math.min(
          velocityY * wheelMetrics.momentumCarrySteps * momentumWeight,
          wheelMetrics.maxMomentumCarrySteps,
        ),
      );
      const snapSteps = Math.round(dragSteps + momentumSteps);
      if (snapSteps === 0) {
        springTrackToCenter();
        return;
      }
      settleLength(snapSteps);
    },
    [
      prefersReducedMotion,
      resetPointerState,
      settleLength,
      springTrackToCenter,
      wheelMetrics.itemHeight,
      wheelMetrics.maxMomentumCarrySteps,
      wheelMetrics.momentumActivationSteps,
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

  const centeredStepOffset = Math.round(renderOffset / wheelMetrics.itemHeight);
  const normalizedRenderOffset =
    renderOffset - centeredStepOffset * wheelMetrics.itemHeight;
  const selectedValue = pendingValue ?? getLengthByOffset(currentValue, centeredStepOffset);
  const visibleItems = useMemo(
    () =>
      Array.from({ length: LENGTH_WHEEL_WINDOW_RADIUS * 2 + 1 }, (_, itemIndex) => {
        const relativeIndex = itemIndex - LENGTH_WHEEL_WINDOW_RADIUS;
        return {
          relativeIndex,
          value: getLengthByOffset(currentValue, centeredStepOffset + relativeIndex),
        };
      }),
    [centeredStepOffset, currentValue],
  );
  const accessibilityValue = pendingValue ?? currentValue;

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
      className={`inline-flex min-w-[7.9rem] items-center justify-between gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-slate-100 transition-[box-shadow,border-color,background-color,color] duration-[220ms] ease-out ${focusRingClass} ${
        isDragging
          ? "border-indigo-300/55 bg-indigo-500/14 shadow-[0_18px_32px_-24px_rgba(99,102,241,0.65)]"
          : "hover:border-indigo-200/35 hover:bg-white/[0.05]"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "touch-none select-none"}`}
      aria-label={`Scene length: ${accessibilityValue}. Click to cycle or drag vertically.`}
      aria-roledescription="length wheel"
      title="Click to cycle scene length. Drag vertically to spin and release to glide."
    >
      <span className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
        Length
      </span>
      <span
        className="relative inline-flex h-[1.25rem] min-w-[4.4rem] flex-1 overflow-hidden align-middle text-right"
        data-testid="setup-length-value-viewport"
        aria-hidden="true"
      >
        <span
          className="absolute inset-x-0 top-0 flex flex-col justify-start transform-gpu will-change-transform"
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
              distance / (wheelMetrics.itemHeight * 1.2),
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

            return (
              <span
                key={`${currentValue}-${centeredStepOffset}-${item.relativeIndex}-${item.value}`}
                data-testid={isSelectedItem ? "setup-length-value" : undefined}
                className="flex items-center justify-end whitespace-nowrap font-medium leading-none text-slate-100"
                style={{
                  height: wheelMetrics.itemHeight,
                  opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: "center right",
                }}
              >
                {item.value}
              </span>
            );
          })}
        </span>
      </span>
    </button>
  );
};
