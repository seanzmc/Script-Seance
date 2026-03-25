// Shared class names for the anchored cream-paper editor family only.
export const paperPopoverShellClassName =
  'rounded-2xl border border-paper-border bg-paper-surface p-4 shadow-[0_20px_54px_rgba(15,23,42,0.24)]';

export const paperPopoverAnimatedShellClassName =
  `${paperPopoverShellClassName} transition-[opacity,transform,box-shadow] duration-200 ease-out`;

export const paperPopoverStatusTextClassName = 'text-xs text-gray-600';

export const paperPopoverTitleClassName =
  'text-sm font-semibold uppercase tracking-[0.16em] text-gray-800';

export const paperPopoverLabelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600';

export const paperPopoverFieldClassName =
  'h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

export const paperPopoverAnimatedFieldClassName =
  `${paperPopoverFieldClassName} transition-[border-color,box-shadow] duration-150 ease-out`;

export const paperPopoverTextAreaClassName =
  'h-28 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-inner outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-gray-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

export const paperPopoverErrorClassName = 'mt-2 text-sm text-red-700';

export const paperPopoverActionsClassName =
  'mt-3.5 flex flex-wrap items-center justify-end gap-2';
