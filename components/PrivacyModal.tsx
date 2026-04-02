import React from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { AlertTriangle, Shield, X } from 'lucide-react';
import { Button } from './Button';
import { modalVariants, overlayVariants } from './motion/primitives';

export interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-0 z-app-modal flex items-center justify-center p-4">
          <m.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
          />
          <m.div
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 id="privacy-modal-title" className="text-lg font-bold text-white">Privacy</h2>
                  <p className="text-xs text-gray-400">What leaves your browser, and what doesn&apos;t.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Close privacy dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-gray-300 leading-relaxed">
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>
                  Prompts and story text are sent to a third-party AI service for generation.
                  Avoid sensitive or personal data.
                </span>
              </div>

              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Your data
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                  <li>Your draft autosaves in your browser. It stays on your device.</li>
                  <li>This app does not store your drafts on the server.</li>
                  <li>Use &quot;Clear draft&quot; to remove the local copy at any time.</li>
                </ul>
              </div>
            </div>

            <div className="mt-6">
              <Button onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
