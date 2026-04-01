import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Search, X } from 'lucide-react';
import { STYLE_CATEGORIES, StyleItem, stylesLibrary } from '../stylesLibrary';
import { modalVariants, overlayVariants } from './motion/primitives';
import {
  styleDialogInsetScrollerClassName,
  styleDialogShellClassName
} from './styleDialogShellStyles';

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

const normalizeStyleValue = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

export const resolveSelectedLibraryStyle = (
  styleId?: string | null,
  styleTitle?: string
): StyleItem | null => {
  const normalizedId = styleId?.trim() ?? '';
  if (normalizedId) {
    const byId = stylesLibrary.find((item) => item.id === normalizedId);
    if (byId) return byId;
  }
  const normalizedTitle = normalizeStyleValue(styleTitle);
  if (!normalizedTitle) return null;
  return stylesLibrary.find((item) => normalizeStyleValue(item.title) === normalizedTitle) ?? null;
};

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
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectedLibraryStyle = useMemo(
    () => resolveSelectedLibraryStyle(selectedStyleId, selectedStyleTitle),
    [selectedStyleId, selectedStyleTitle]
  );
  const isStyleBlank = !selectedLibraryStyle && !normalizeStyleValue(selectedStyleTitle);
  const filteredStyles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return stylesLibrary;
    return stylesLibrary.filter((item) => (
      item.title.toLowerCase().includes(normalizedSearch) ||
      item.description.toLowerCase().includes(normalizedSearch)
    ));
  }, [search]);
  const groupedFilteredStyles = useMemo(
    () => STYLE_CATEGORIES.map((category) => ({
      ...category,
      items: filteredStyles.filter((item) => item.category === category.id)
    })).filter((group) => group.items.length > 0),
    [filteredStyles]
  );

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedLibraryStyle) return;
    const selectedButton = rowRefs.current[selectedLibraryStyle.id];
    if (!selectedButton || typeof selectedButton.scrollIntoView !== 'function') return;
    selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isOpen, selectedLibraryStyle]);

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
            className={`${styleDialogShellClassName} max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col sm:max-h-[88vh]`}
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
            <div className={styleDialogInsetScrollerClassName}>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-10 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Search styles..."
                    aria-label="Search styles"
                    disabled={disabled}
                  />
                </div>
                <div
                  className="max-h-[58vh] overflow-y-auto rounded-[1.15rem] border border-white/8 bg-slate-950/72 p-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.24)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/26"
                  data-testid={listTestId}
                >
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => onSelect({ styleId: null, style: '' })}
                      disabled={disabled}
                      aria-pressed={isStyleBlank}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        isStyleBlank
                          ? 'border-indigo-300 bg-indigo-500/20 text-indigo-100'
                          : 'border-white/10 bg-white/[0.02] text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      None (default style)
                    </button>
                  </div>
                  {groupedFilteredStyles.length > 0 ? groupedFilteredStyles.map((group) => (
                    <div key={group.id} className="border-t border-white/10 px-2 py-2 space-y-1.5">
                      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-100/55">
                        {group.label}
                      </p>
                      {group.items.map((item) => {
                        const isSelected = selectedLibraryStyle?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            ref={(node) => {
                              rowRefs.current[item.id] = node;
                            }}
                            type="button"
                            onClick={() => onSelect({ styleId: item.id, style: item.title })}
                            disabled={disabled}
                            aria-pressed={isSelected}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? 'border-indigo-300 bg-indigo-500/20 text-indigo-100'
                                : 'border-white/10 bg-white/[0.02] text-slate-200 hover:bg-white/[0.04]'
                            }`}
                          >
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="mt-0.5 text-xs text-slate-300">{item.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  )) : (
                    <p className="px-4 py-4 text-sm text-slate-300">No styles match your search.</p>
                  )}
                </div>
              </div>
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
