import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type AnchoredPopoverPlacement = 'top' | 'bottom';
type AnchoredPopoverAlign = 'start' | 'center' | 'end';

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
  ensureAnchorVisible = true
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || typeof window === 'undefined') {
      setPosition(null);
      return;
    }

    if (ensureAnchorVisible && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverNode = popoverRef.current;
      if (!popoverNode) return;
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
      const maxTop = viewportHeight - popoverRect.height - viewportPadding;
      const top = Math.min(Math.max(rawTop, viewportPadding), Math.max(viewportPadding, maxTop));

      setPosition({ top, left, placement });
    };

    const rafId = window.requestAnimationFrame(updatePosition);
    const handleScrollOrResize = () => {
      window.requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [align, anchor, ensureAnchorVisible, offset, open, preferredPlacement, viewportPadding]);

  if (!open || !anchor || typeof document === 'undefined') return null;

  const anchorRect = anchor.getBoundingClientRect();
  const fallbackTop = preferredPlacement === 'bottom'
    ? anchorRect.bottom + offset
    : anchorRect.top - offset;
  const fallbackLeft = anchorRect.left;

  return createPortal(
    <div
      ref={popoverRef}
      className={className}
      style={{
        position: 'fixed',
        top: position?.top ?? fallbackTop,
        left: position?.left ?? fallbackLeft,
        zIndex: 90,
        visibility: 'visible'
      }}
      data-placement={position?.placement ?? preferredPlacement}
    >
      {children}
    </div>,
    document.body
  );
};
