import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Button } from './Button';
import { STYLE_CATEGORIES, stylesLibrary } from '../stylesLibrary';
import { StyleLibrary } from './StyleLibrary';
import { StyleSelectionCard } from './StyleSelectionCard';
import { resolveSelectedLibraryStyle } from './styleLibrarySelection';
import { modalVariants, overlayVariants } from './motion/primitives';
import {
  styleDialogInsetScrollerClassName,
  styleDialogShellClassName
} from './styleDialogShellStyles';

export interface StyleEditModalProps {
  isOpen: boolean;
  value: string;
  presets: string[];
  onChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export const StyleEditModal: React.FC<StyleEditModalProps> = ({
  isOpen,
  value,
  presets,
  onChange,
  onSave,
  onClose
}) => {
  const [isLibraryVisible, setIsLibraryVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;
    setIsLibraryVisible(false);
  }, [isOpen]);

  const selectedStyle = useMemo(() => resolveSelectedLibraryStyle(null, value), [value]);
  const customToneFieldId = 'style-edit-custom-tone';
  const selectedStyleCategoryLabel = useMemo(() => {
    if (!selectedStyle) return null;
    return STYLE_CATEGORIES.find((category) => category.id === selectedStyle.category)?.label ?? null;
  }, [selectedStyle]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-24 z-editor-modal flex items-start justify-center overflow-y-auto px-4 py-4 sm:top-28 sm:py-6">
          <m.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
          />
          <m.div
            className={`${styleDialogShellClassName} max-w-4xl max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden sm:max-h-[calc(100vh-10rem)]`}
            role="dialog"
            aria-modal="true"
            aria-label="Edit style"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <div className="relative z-[1] border-b border-white/10 px-5 py-4 space-y-1 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Style</p>
              <h2 className="text-xl font-semibold text-white">Tone &amp; style</h2>
              <p className="text-sm text-slate-300">Pick a tone from the library or write your own.</p>
            </div>
            <div className={styleDialogInsetScrollerClassName}>
              <div className="flex min-h-0 flex-col gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor={customToneFieldId}
                    className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400"
                  >
                    Your own tone
                  </label>
                  <textarea
                    id={customToneFieldId}
                    rows={1}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="e.g., Witty noir with clipped banter and escalating absurdity."
                    className="min-h-[44px] w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                {presets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => {
                      const isSelected = value.trim().toLowerCase() === preset.toLowerCase();
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => onChange(preset)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-indigo-300 bg-indigo-500/20 text-indigo-100'
                              : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <StyleSelectionCard
                  selectedStyle={selectedStyle}
                  fallbackLabel={value.trim() || 'None (default style)'}
                  categoryLabel={selectedStyleCategoryLabel}
                  onBrowse={() => setIsLibraryVisible((previous) => !previous)}
                  onClear={() => onChange('')}
                  onShuffle={() => {
                    const randomStyle = stylesLibrary[Math.floor(Math.random() * stylesLibrary.length)];
                    if (randomStyle) onChange(randomStyle.title);
                  }}
                  browseLabel={isLibraryVisible ? 'Hide library' : 'Browse library'}
                />
                <AnimatePresence initial={false}>
                  {isLibraryVisible ? (
                    <m.div
                      key="inline-style-library"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="min-h-0 rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-3 sm:p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-100/60">Style</p>
                          <h3 className="text-base font-semibold text-white">Style Library</h3>
                          <p className="text-sm text-slate-300">Browse the full library without leaving this editor.</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setIsLibraryVisible(false)}>
                          Hide
                        </Button>
                      </div>
                      <div className="h-[min(46vh,28rem)] min-h-[18rem] min-w-0">
                        <StyleLibrary
                          selectedStyleTitle={value}
                          onSelect={({ style }) => {
                            onChange(style);
                            setIsLibraryVisible(false);
                          }}
                          autoFocusSearch
                        />
                      </div>
                    </m.div>
                  ) : null}
                </AnimatePresence>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <Button size="sm" onClick={onSave}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
