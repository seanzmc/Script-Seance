import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPresent } from 'motion/react';
import * as m from 'motion/react-m';
import { anchoredPopoverVariants } from './motion/primitives';

export type AnchoredPopoverPlacement = 'top' | 'bottom';
export type AnchoredPopoverAlign = 'start' | 'center' | 'end';

export interface AnchoredPopoverProps {
  open: boolean;
  anchor: HTMLElement | null;
  children: React.ReactNode;
  className?: string;
  preferredPlacement?: AnchoredPopoverPlacement;
  align?: AnchoredPopoverAlign;
  offset?: number;
  viewportPadding?: number;
  ensureAnchorVisible?: boolean;
  topBoundary?: HTMLElement | null;
}

type PopoverPosition = {
  top: number;
  left: number;
  placement: AnchoredPopoverPlacement;
};

const getAlignedLeft = (
  anchorRect: DOMRect,
  popoverRect: DOMRect,
  align: AnchoredPopoverAlign
) => {
  if (align === 'start') return anchorRect.left;
  if (align === 'end') return anchorRect.right - popoverRect.width;
  return anchorRect.left + ((anchorRect.width - popoverRect.width) / 2);
};

export const AnchoredPopover: React.FC<AnchoredPopoverProps> = ({
  open,
  anchor,
  children,
  className = '',
  preferredPlacement = 'bottom',
  align = 'center',
  offset = 10,
  viewportPadding = 12,
  ensureAnchorVisible = true,
  topBoundary = null
}) => {
  const isPresent = useIsPresent();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const lastMeasuredPositionRef = useRef<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || typeof window === 'undefined') {
      setPosition(null);
      lastMeasuredPositionRef.current = null;
      return;
    }

    if (ensureAnchorVisible && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    const measurePosition = (): PopoverPosition | null => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverNode = popoverRef.current;
      if (!popoverNode) return null;
      const popoverRect = popoverNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - anchorRect.bottom;
      const spaceAbove = anchorRect.top;

      const placement: AnchoredPopoverPlacement = preferredPlacement === 'bottom'
        ? (spaceBelow >= popoverRect.height + offset || spaceBelow >= spaceAbove ? 'bottom' : 'top')
        : (spaceAbove >= popoverRect.height + offset || spaceAbove >= spaceBelow ? 'top' : 'bottom');

      const unclampedLeft = getAlignedLeft(anchorRect, popoverRect, align as AnchoredPopoverAlign);
      const maxLeft = viewportWidth - popoverRect.width - viewportPadding;
      const left = Math.min(Math.max(unclampedLeft, viewportPadding), Math.max(viewportPadding, maxLeft));
      const rawTop = placement === 'bottom'
        ? anchorRect.bottom + offset
        : anchorRect.top - popoverRect.height - offset;
      const minTop = topBoundary
        ? Math.max(viewportPadding, topBoundary.getBoundingClientRect().top + viewportPadding)
        : viewportPadding;
      const maxTop = viewportHeight - popoverRect.height - viewportPadding;
      const top = Math.min(Math.max(rawTop, minTop), Math.max(minTop, maxTop));

      return { top, left, placement };
    };

    const settleInitialPosition = () => {
      const nextPosition = measurePosition();
      if (!nextPosition) return;
      const previousMeasured = lastMeasuredPositionRef.current;
      const isStable = previousMeasured
        && previousMeasured.top === nextPosition.top
        && previousMeasured.left === nextPosition.left
        && previousMeasured.placement === nextPosition.placement;
      lastMeasuredPositionRef.current = nextPosition;
      if (isStable) {
        setPosition(nextPosition);
        settleFrameRef.current = null;
        return;
      }
      settleFrameRef.current = window.requestAnimationFrame(settleInitialPosition);
    };

    lastMeasuredPositionRef.current = null;
    settleFrameRef.current = window.requestAnimationFrame(settleInitialPosition);
    const handleScrollOrResize = () => {
      window.requestAnimationFrame(() => {
        const nextPosition = measurePosition();
        if (!nextPosition) return;
        lastMeasuredPositionRef.current = nextPosition;
        setPosition(nextPosition);
      });
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      if (settleFrameRef.current !== null) {
        window.cancelAnimationFrame(settleFrameRef.current);
        settleFrameRef.current = null;
      }
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [align, anchor, ensureAnchorVisible, offset, open, preferredPlacement, topBoundary, viewportPadding]);

  if (!open || !anchor || typeof document === 'undefined') return null;

  const anchorRect = anchor.getBoundingClientRect();
  const fallbackRawTop = preferredPlacement === 'bottom'
    ? anchorRect.bottom + offset
    : anchorRect.top - offset;
  const fallbackMinTop = topBoundary
    ? Math.max(viewportPadding, topBoundary.getBoundingClientRect().top + viewportPadding)
    : viewportPadding;
  const fallbackTop = Math.max(fallbackRawTop, fallbackMinTop);
  const fallbackLeft = anchorRect.left;

  return createPortal(
    <m.div
      ref={popoverRef}
      className={className}
      initial="hidden"
      animate={position ? 'visible' : 'hidden'}
      exit="exit"
      variants={anchoredPopoverVariants}
      style={{
        position: 'fixed',
        top: position?.top ?? fallbackTop,
        left: position?.left ?? fallbackLeft,
        zIndex: 90,
        opacity: position ? 1 : 0,
        pointerEvents: position && isPresent ? 'auto' : 'none',
        transformOrigin: `center ${position?.placement === 'top' ? 'bottom' : 'top'}`
      }}
      aria-hidden={!isPresent ? true : undefined}
      data-placement={position?.placement ?? preferredPlacement}
    >
      {children}
    </m.div>,
    document.body
  );
};
