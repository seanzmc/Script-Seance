import React from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import type { Scene } from '../../types';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import {
  bottomSheetVariants,
  drawerLeftVariants,
  overlayVariants
} from '../motion/primitives';

export interface SceneOutlineDrawerProps {
  scenes: Scene[];
  activeSceneId: string | null;
  isOpen: boolean;
  isMobileDialogViewport: boolean;
  onClose: () => void;
  onSelectScene: (sceneId: string) => void;
}

export const SceneOutlineDrawer: React.FC<SceneOutlineDrawerProps> = ({
  scenes,
  activeSceneId,
  isOpen,
  isMobileDialogViewport,
  onClose,
  onSelectScene
}) => (
  <AnimatePresence initial={false}>
    {isOpen ? (
      <>
        <m.div
          key="scene-outline-backdrop"
          className="fixed inset-0 z-drawer-backdrop bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={overlayVariants}
        />
        <m.aside
          key="scene-outline-panel"
          role="dialog"
          aria-label="Scene outline"
          data-testid="scene-outline-drawer"
          className="fixed z-drawer flex flex-col border-gray-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(10,15,28,0.96))] shadow-[24px_0_48px_rgba(0,0,0,0.42)] md:inset-y-0 md:left-0 md:w-full md:max-w-[24rem] md:border-r max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[75vh] max-md:rounded-t-[1.75rem] max-md:border-t"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={isMobileDialogViewport ? bottomSheetVariants : drawerLeftVariants}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-800/80 px-3 py-3 sm:px-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Scene Outline</p>
              <h2 className="text-base font-semibold text-white">Navigate the draft</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-900/50 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Close scene outline"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-2.5 sm:px-3 sm:py-3">
            <DraftOutlinePanel
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelectScene={onSelectScene}
            />
          </div>
        </m.aside>
      </>
    ) : null}
  </AnimatePresence>
);
