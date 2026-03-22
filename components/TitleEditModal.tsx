import React, { useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Button } from './Button';
import { modalVariants, overlayVariants } from './motion/primitives';

export interface TitleEditModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export const TitleEditModal: React.FC<TitleEditModalProps> = ({
  isOpen,
  value,
  onChange,
  onSave,
  onClose,
  inputRef
}) => {
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
    if (isOpen) {
      requestAnimationFrame(() => inputRef?.current?.focus());
    }
  }, [inputRef, isOpen]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <m.div
            key="edit-title-backdrop"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
          />
          <m.div
            key="edit-title-panel"
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Edit title"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <div className="border-b border-gray-800 px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gray-500">Edit Title</p>
              <h2 className="text-lg font-semibold text-white">Rename your script</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Untitled Screenplay"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-base text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onSave}>
                  Save
                </Button>
              </div>
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
