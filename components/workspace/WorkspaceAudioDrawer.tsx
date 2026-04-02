import React from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import { drawerRightVariants, overlayVariants } from '../motion/primitives';

export interface WorkspaceAudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playbackContent: React.ReactNode;
  voicesContent?: React.ReactNode;
}

export const WorkspaceAudioDrawer: React.FC<WorkspaceAudioDrawerProps> = ({
  isOpen,
  onClose,
  playbackContent,
  voicesContent
}) => (
  <AnimatePresence initial={false}>
    {isOpen ? (
      <>
        <m.div
          key="audio-drawer-backdrop"
          className="fixed inset-0 z-drawer-backdrop bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={overlayVariants}
        />
        <m.aside
          key="audio-drawer-panel"
          role="dialog"
          aria-label="Audio drawer"
          data-testid="audio-drawer"
          className="fixed inset-y-0 right-0 z-drawer flex w-full max-w-[28rem] flex-col border-l border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] shadow-[-24px_0_48px_rgba(0,0,0,0.42)]"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={drawerRightVariants}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-3.5 py-3 sm:px-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Audio</p>
              <h2 className="text-base font-semibold text-white">Voice & Playback</h2>
              <p className="text-[11px] text-gray-400">Preview voices, play the draft, and follow along as it reads.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900/55 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Close audio drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            <div className="space-y-3">
              <section>
                {playbackContent}
              </section>
              <section className="rounded-xl border border-gray-800/80 bg-gray-950/20 px-3 py-2.5">
                {voicesContent ?? <p className="text-[11px] text-gray-500">Voice cast not set up yet.</p>}
              </section>
            </div>
          </div>
        </m.aside>
      </>
    ) : null}
  </AnimatePresence>
);
