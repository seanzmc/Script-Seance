export const styleDialogShellClassName = [
  'relative w-full overflow-hidden rounded-[1.75rem]',
  'border border-white/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.985),rgba(10,15,28,0.965))]',
  'ring-1 ring-white/6',
  'shadow-[0_34px_100px_rgba(2,6,23,0.78),0_10px_28px_rgba(15,23,42,0.42),0_0_0_1px_rgba(148,163,184,0.06)]',
  'before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[calc(1.75rem-1px)] before:border before:border-white/[0.045] before:content-[\'\']',
  'after:pointer-events-none after:absolute after:left-8 after:right-8 after:top-0 after:h-14 after:rounded-full after:bg-[radial-gradient(circle_at_center,rgba(191,219,254,0.12),transparent_72%)] after:blur-xl after:content-[\'\']'
].join(' ');

export const styleDialogInsetScrollerClassName = [
  'min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5',
  'pr-3 sm:pr-4',
  '[scrollbar-gutter:stable]',
  '[scrollbar-width:thin]',
  '[scrollbar-color:rgba(148,163,184,0.28)_transparent]',
  '[&::-webkit-scrollbar]:w-2.5',
  '[&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full',
  '[&::-webkit-scrollbar-thumb]:bg-slate-400/28',
  '[&::-webkit-scrollbar-thumb:hover]:bg-slate-300/36'
].join(' ');
