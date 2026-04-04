import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Search } from 'lucide-react';
import { STYLE_CATEGORIES, StyleCategory, stylesLibrary } from '../stylesLibrary';
import { resolveSelectedLibraryStyle } from './styleLibrarySelection';

export interface StyleLibraryProps {
  selectedStyleId?: string | null;
  selectedStyleTitle?: string;
  onSelect: (selection: { styleId: string | null; style: string }) => void;
  disabled?: boolean;
  listTestId?: string;
  autoFocusSearch?: boolean;
  useInternalListScroll?: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;

const getCategoryLabel = (categoryId: StyleCategory) => (
  STYLE_CATEGORIES.find((category) => category.id === categoryId)?.label ?? ''
);

export const StyleLibrary: React.FC<StyleLibraryProps> = ({
  selectedStyleId,
  selectedStyleTitle,
  onSelect,
  disabled = false,
  listTestId,
  autoFocusSearch = false,
  useInternalListScroll = true
}) => {
  const selectedLibraryStyle = useMemo(
    () => resolveSelectedLibraryStyle(selectedStyleId, selectedStyleTitle),
    [selectedStyleId, selectedStyleTitle]
  );
  const initialTab = selectedLibraryStyle?.category ?? STYLE_CATEGORIES[0]?.id ?? null;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTabId, setActiveTabId] = useState<StyleCategory | null>(initialTab);
  const [focusedTabId, setFocusedTabId] = useState<StyleCategory | null>(initialTab);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!autoFocusSearch) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusSearch]);

  const normalizedSearch = search.trim().toLowerCase();
  const isSearchMode = normalizedSearch.length > 0;
  const filteredStyles = useMemo(() => {
    if (!normalizedSearch) return stylesLibrary;
    return stylesLibrary.filter((item) => {
      const categoryLabel = getCategoryLabel(item.category).toLowerCase();
      return (
        item.title.toLowerCase().includes(normalizedSearch) ||
        item.description.toLowerCase().includes(normalizedSearch) ||
        item.sampleLine.toLowerCase().includes(normalizedSearch) ||
        categoryLabel.includes(normalizedSearch)
      );
    });
  }, [normalizedSearch]);

  const visibleStyles = useMemo(() => {
    if (isSearchMode) return filteredStyles;
    if (!activeTabId) return [];
    return filteredStyles.filter((item) => item.category === activeTabId);
  }, [activeTabId, filteredStyles, isSearchMode]);

  useEffect(() => {
    if (!selectedLibraryStyle) return;
    if (!isSearchMode && activeTabId !== selectedLibraryStyle.category) return;
    const selectedButton = rowRefs.current[selectedLibraryStyle.id];
    if (!selectedButton || typeof selectedButton.scrollIntoView !== 'function') return;
    selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeTabId, isSearchMode, selectedLibraryStyle, visibleStyles]);

  const isStyleBlank = !selectedLibraryStyle && !(selectedStyleTitle?.trim() ?? '');

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabId: StyleCategory
  ) => {
    const currentIndex = STYLE_CATEGORIES.findIndex((category) => category.id === tabId);
    if (currentIndex === -1) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % STYLE_CATEGORIES.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + STYLE_CATEGORIES.length) % STYLE_CATEGORIES.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = STYLE_CATEGORIES.length - 1;
      }
      const nextTabId = STYLE_CATEGORIES[nextIndex]?.id ?? null;
      if (!nextTabId) return;
      setFocusedTabId(nextTabId);
      tabRefs.current[nextTabId]?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveTabId(tabId);
      setFocusedTabId(tabId);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-10 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Search styles..."
            aria-label="Search styles"
            disabled={disabled}
          />
        </div>
        {!isSearchMode ? (
          <div
            className="pb-1"
            role="tablist"
            aria-label="Style categories"
          >
            <div className="grid grid-cols-4 gap-2">
              {STYLE_CATEGORIES.map((category) => {
                const isActive = activeTabId === category.id;
                return (
                  <button
                    key={category.id}
                    ref={(node) => {
                      tabRefs.current[category.id] = node;
                    }}
                    id={`style-tab-${category.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`style-panel-${category.id}`}
                    tabIndex={focusedTabId === category.id ? 0 : -1}
                    onClick={() => {
                      setActiveTabId(category.id);
                      setFocusedTabId(category.id);
                    }}
                    onFocus={() => setFocusedTabId(category.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, category.id)}
                    disabled={disabled}
                    className={`min-w-0 rounded-full border px-2 py-2 text-center text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-indigo-300/50 bg-indigo-500/18 text-indigo-100 shadow-[inset_0_-2px_0_rgba(191,219,254,0.6)]'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`mt-3 min-w-0 rounded-[1.15rem] border border-white/8 bg-slate-950/72 p-1 ${
          useInternalListScroll
            ? 'h-[min(60vh,36rem)] min-h-[18rem] flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.24)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/26'
            : ''
        }`}
        data-testid={listTestId}
      >
        <div className="p-2">
          <button
            type="button"
            onClick={() => onSelect({ styleId: null, style: '' })}
            disabled={disabled}
            aria-pressed={isStyleBlank}
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
              isStyleBlank
                ? 'border-indigo-300 bg-indigo-500/20 text-indigo-100'
                : 'border-white/10 bg-white/[0.02] text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <p className="text-sm font-semibold">None (default style)</p>
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={isSearchMode ? `search:${normalizedSearch}` : `tab:${activeTabId ?? 'none'}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="px-2 pb-2"
            role={isSearchMode ? undefined : 'tabpanel'}
            id={isSearchMode || !activeTabId ? undefined : `style-panel-${activeTabId}`}
            aria-labelledby={isSearchMode || !activeTabId ? undefined : `style-tab-${activeTabId}`}
          >
            {visibleStyles.length > 0 ? (
              <div className="grid min-w-0 gap-2">
                {visibleStyles.map((item) => {
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
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-500/20 text-indigo-100'
                          : 'border-white/10 bg-white/[0.02] text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-words pr-1 text-sm font-semibold leading-5 text-white">
                          {item.title}
                        </p>
                        {isSearchMode ? (
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                            {getCategoryLabel(item.category)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-300" title={item.description}>
                        {item.description}
                      </p>
                      <p className="mt-2 break-words text-xs italic leading-5 text-slate-200/85" title={item.sampleLine}>
                        {item.sampleLine}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 py-4 text-sm text-slate-300">No styles match your search.</p>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
