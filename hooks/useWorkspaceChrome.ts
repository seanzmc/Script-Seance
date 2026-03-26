import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryContext } from '../types';

interface UseWorkspaceChromeParams {
  context: StoryContext | null;
  focusScriptScroll: () => void;
  isPlaying: boolean;
}

const MOBILE_DIALOG_BREAKPOINT = 768;

export const useWorkspaceChrome = ({
  context,
  focusScriptScroll,
  isPlaying
}: UseWorkspaceChromeParams) => {
  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false);
  const [isMobileDialogViewport, setIsMobileDialogViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_DIALOG_BREAKPOINT : false
  ));
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleDraft, setStyleDraft] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [lastNavigatedSceneId, setLastNavigatedSceneId] = useState<string | null>(null);
  const generateMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const toggleGenerateMenu = useCallback(() => {
    setIsOutlineOpen(false);
    setIsGenerateMenuOpen((previous) => !previous);
  }, []);

  const closeGenerateMenu = useCallback(() => {
    setIsGenerateMenuOpen(false);
  }, []);

  const toggleExportMenu = useCallback(() => {
    setIsExportMenuOpen((previous) => !previous);
  }, []);

  const closeExportMenu = useCallback(() => {
    setIsExportMenuOpen(false);
  }, []);

  const toggleOutline = useCallback(() => {
    setIsGenerateMenuOpen(false);
    setIsAudioDrawerOpen(false);
    setIsOutlineOpen((previous) => !previous);
  }, []);

  const closeOutline = useCallback((options?: { focus?: boolean }) => {
    setIsOutlineOpen(false);
    if (options?.focus) {
      focusScriptScroll();
    }
  }, [focusScriptScroll]);

  const openAudioDrawer = useCallback(() => {
    setIsOutlineOpen(false);
    setIsAudioDrawerOpen(true);
  }, []);

  const closeAudioDrawer = useCallback((options?: { focus?: boolean }) => {
    setIsAudioDrawerOpen(false);
    if (options?.focus) {
      focusScriptScroll();
    }
  }, [focusScriptScroll]);

  const openTitleModal = useCallback((title: string) => {
    setIsTitleModalOpen((previous) => {
      if (previous) {
        return false;
      }
      setTitleDraft(title);
      return true;
    });
  }, []);

  const closeTitleModal = useCallback(() => {
    setIsTitleModalOpen(false);
  }, []);

  const openStyleModal = useCallback((style: string) => {
    setIsStyleModalOpen((previous) => {
      if (previous) {
        return false;
      }
      setStyleDraft(style);
      return true;
    });
  }, []);

  const closeStyleModal = useCallback(() => {
    setIsStyleModalOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateViewport = () => {
      setIsMobileDialogViewport(window.innerWidth < MOBILE_DIALOG_BREAKPOINT);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (context?.scenes.some((scene) => scene.id === lastNavigatedSceneId)) {
      return;
    }
    setLastNavigatedSceneId(null);
  }, [context, lastNavigatedSceneId]);

  useEffect(() => {
    if (context) return;
    setIsOutlineOpen(false);
  }, [context]);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (exportMenuRef.current?.contains(targetNode)) return;
      setIsExportMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  useEffect(() => {
    if (!isGenerateMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (generateMenuRef.current?.contains(targetNode)) return;
      setIsGenerateMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGenerateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerateMenuOpen]);

  useEffect(() => {
    if (!isOutlineOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOutline({ focus: true });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOutline, isOutlineOpen]);

  useEffect(() => {
    if (!isAudioDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAudioDrawer({ focus: true });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeAudioDrawer, isAudioDrawerOpen]);

  useEffect(() => {
    if (!isPlaying || !isAudioDrawerOpen) return;
    closeAudioDrawer({ focus: true });
  }, [closeAudioDrawer, isAudioDrawerOpen, isPlaying]);

  return {
    isGenerateMenuOpen,
    isOutlineOpen,
    isAudioDrawerOpen,
    isMobileDialogViewport,
    isTitleModalOpen,
    titleDraft,
    setTitleDraft,
    isStyleModalOpen,
    styleDraft,
    setStyleDraft,
    isExportMenuOpen,
    lastNavigatedSceneId,
    setLastNavigatedSceneId,
    generateMenuRef,
    exportMenuRef,
    toggleGenerateMenu,
    closeGenerateMenu,
    toggleExportMenu,
    closeExportMenu,
    toggleOutline,
    closeOutline,
    openAudioDrawer,
    closeAudioDrawer,
    openTitleModal,
    closeTitleModal,
    openStyleModal,
    closeStyleModal
  };
};
