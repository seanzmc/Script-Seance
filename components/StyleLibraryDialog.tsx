import React, { useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import { StyleLibrary } from './StyleLibrary';
import { modalVariants, overlayVariants } from './motion/primitives';
import { styleDialogShellClassName } from './styleDialogShellStyles';

export { resolveSelectedLibraryStyle } from './styleLibrarySelection';

export interface StyleLibraryDialogProps {
  isOpen: boolean;
  selectedStyleId?: string | null;
  selectedStyleTitle?: string;
  onClose: () => void;
  onSelect: (selection: { styleId: string | null; style: string }) => void;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  listTestId?: string;
}

export const StyleLibraryDialog: React.FC<StyleLibraryDialogProps> = ({
  isOpen,
  selectedStyleId,
  selectedStyleTitle,
  onClose,
  onSelect,
  disabled = false,
  title = 'Style Library',
  subtitle = 'Pick a tone for this script.',
  listTestId,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      const active = document.activeElement as HTMLElement | null;
      if (!active || !modal.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-0 z-library flex items-center justify-center overflow-y-auto px-4 py-4 sm:py-6">
          <m.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
          />
          <m.div
            ref={modalRef}
            className={`${styleDialogShellClassName} max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden sm:max-h-[88vh]`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <div className="relative z-[1] flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-100/60">Style</p>
                <h2 className="text-base font-semibold text-white">{title}</h2>
                <p className="text-sm text-slate-300">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close style library"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex flex-col flex-1 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
              <StyleLibrary
                selectedStyleId={selectedStyleId}
                selectedStyleTitle={selectedStyleTitle}
                onSelect={onSelect}
                disabled={disabled}
                listTestId={listTestId}
                autoFocusSearch
              />
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
