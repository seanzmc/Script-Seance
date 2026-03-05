import React from 'react';
import { X } from 'lucide-react';

export type ToolPanelVariant = 'mobile-sheet' | 'desktop-panel';
export type ToolPanelPreset = 'compact' | 'default' | 'medium';

const TOOL_PANEL_HEADER_HEIGHT_PX = 48;

const TOOL_PANEL_MAX_HEIGHTS: Record<ToolPanelVariant, Record<ToolPanelPreset, string>> = {
  'desktop-panel': {
    compact: 'min(50vh,520px)',
    default: 'min(70vh,720px)',
    medium: 'min(60vh,620px)'
  },
  'mobile-sheet': {
    compact: 'min(208px,40vh)',
    default: '70vh',
    medium: '60vh'
  }
};

export const getToolPanelMaxHeight = (variant: ToolPanelVariant, preset: ToolPanelPreset): string => (
  TOOL_PANEL_MAX_HEIGHTS[variant][preset]
);

export const getToolPanelBodyMaxHeight = (maxHeight: string): string => (
  `calc(${maxHeight} - ${TOOL_PANEL_HEADER_HEIGHT_PX}px)`
);

export interface ToolPanelShellProps {
  title: string;
  onClose?: () => void;
  variant: ToolPanelVariant;
  maxHeight: string;
  bodyMaxHeight: string;
  bodyClassName?: string;
  closeLabel?: string;
  shellTestId?: string;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}

export const ToolPanelShell: React.FC<ToolPanelShellProps> = ({
  title,
  onClose,
  variant,
  maxHeight,
  bodyMaxHeight,
  bodyClassName = 'p-3',
  closeLabel = 'Close panel',
  shellTestId,
  closeButtonRef,
  children
}) => {
  const shellClassName = variant === 'mobile-sheet'
    ? 'w-full rounded-t-2xl border border-gray-700 bg-gray-950 shadow-[0_22px_56px_rgba(0,0,0,0.52)]'
    : 'w-full rounded-2xl border border-gray-700 bg-gray-950 shadow-[0_24px_64px_rgba(0,0,0,0.48)]';

  return (
    <div
      className={`${shellClassName} overflow-hidden flex h-auto flex-col`}
      style={{ maxHeight }}
      data-testid={shellTestId}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-300">{title}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div
        className={`${bodyClassName} overflow-y-auto overscroll-contain`}
        style={{ maxHeight: bodyMaxHeight }}
      >
        {/* Tool content rule: keep overflow at shell body; avoid root overflow in tool components. */}
        {children}
      </div>
    </div>
  );
};
