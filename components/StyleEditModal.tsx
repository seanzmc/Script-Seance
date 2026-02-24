import React, { useEffect, useRef } from 'react';
import { Button } from './Button';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!isOpen) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Edit style"
      >
        <div className="border-b border-gray-800 px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gray-500">Style</p>
          <h2 className="text-lg font-semibold text-white">Edit writing style</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => {
              const isSelected = value.trim().toLowerCase() === preset.toLowerCase();
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange(preset)}
                  className={`text-[10px] px-2.5 py-1.5 rounded-full ring-1 transition-colors ${
                    isSelected
                      ? 'text-indigo-100 bg-indigo-500/35 ring-indigo-100/55'
                      : 'text-indigo-100/90 bg-indigo-500/15 ring-indigo-200/30 hover:bg-indigo-500/24 hover:ring-indigo-100/45'
                  }`}
                  title={`Use style: ${preset}`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <textarea
            ref={textareaRef}
            rows={4}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="e.g., Witty noir with clipped banter and escalating absurdity."
            className="w-full rounded-lg p-2.5 text-white placeholder-slate-400 bg-slate-900/80 ring-1 ring-white/15 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-y min-h-[110px]"
          />
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
    </div>
  );
};
