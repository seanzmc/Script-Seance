import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SetupForm, SetupFormState } from './components/SetupForm';
import { Button } from './components/Button';
import { ControlPanel } from './components/ControlPanel';
import { ScriptPane } from './components/ScriptPane';
import { VoicesPanel } from './components/VoicesPanel';
import { PlaybackPanel } from './components/PlaybackPanel';
import { VoiceCastingModal } from './components/VoiceCastingModal';
import { LoginModal } from './components/LoginModal';
import { PrivacyModal } from './components/PrivacyModal';
import {
  createGenerateSceneRequest,
  createSuggestPlotTwistRequest,
  createRegenerateScriptBlockRequest,
  CancellableRequest
} from './services/gemini';
import { getSession, login } from './services/auth';
import { Scene, StoryContext, VoiceConfig, AVAILABLE_VOICES, ScriptBlock, BlockType, GENRES } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { ChevronDown, Download, RotateCcw } from 'lucide-react';

interface ToastState {
  message: string;
  onUndo?: () => void;
}

interface DraftPayload {
  context: StoryContext;
  userInstruction: string;
  savedAt: string;
}

type ControlStep = 'setup' | 'script' | 'voices' | 'playback';

const DRAFT_STORAGE_KEY = 'script-seance:draft:v1';
const DRAFT_DEBOUNCE_MS = 800;
const DEFAULT_SETUP_STATE: SetupFormState = {
  genre: GENRES[0],
  premise: '',
  characters: ['Hero', 'Villain'],
  style: '',
  length: 'Medium'
};

const isStoryContext = (value: unknown): value is StoryContext => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.genre === 'string' &&
    typeof record.premise === 'string' &&
    Array.isArray(record.characters) &&
    Array.isArray(record.scenes)
  );
};

const getErrorMeta = (err: unknown) => {
  if (!err || typeof err !== 'object') {
    return { code: undefined, status: undefined, message: undefined };
  }
  const record = err as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  const message = typeof record.message === 'string' ? record.message : undefined;
  return { code, status, message };
};

export default function App() {
  // State
  const [context, setContext] = useState<StoryContext | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceConfigs, setVoiceConfigs] = useState<VoiceConfig[]>([]);
  const [userInstruction, setUserInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const activeAiRequestRef = useRef<CancellableRequest<unknown> | null>(null);

  const [setupState, setSetupState] = useState<SetupFormState>(DEFAULT_SETUP_STATE);
  const [openPanels, setOpenPanels] = useState({
    setup: true,
    voices: false,
    playback: false
  });
  const [hasReviewedVoices, setHasReviewedVoices] = useState(false);
  const [insertTarget, setInsertTarget] = useState<{ sceneId: string; blockId: string } | null>(null);

  // Playback Settings
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Casting Modal State
  const [castingCharacter, setCastingCharacter] = useState<string | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const didHydrateDraftRef = useRef(false);
  const lastNonPrivacyPathRef = useRef('/');
  const autosaveFailureNotifiedRef = useRef(false);

  const updateSetupState = useCallback((next: Partial<SetupFormState>) => {
    setSetupState(prev => ({ ...prev, ...next }));
  }, []);
  const handleSelectInsertTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    setInsertTarget(target);
  }, []);

  const handleAiError = useCallback((err: unknown, fallbackMessage: string) => {
    const { code, status, message } = getErrorMeta(err);
    if (code === 'REQUEST_ABORTED') {
      setError(null);
      return true;
    }
    if (code === 'REQUEST_TIMEOUT' || code === 'UPSTREAM_TIMEOUT') {
      setError('Request timed out. Please try again.');
      return true;
    }
    if (status === 401) {
      setAuthStatus('unauthenticated');
      setAuthError('Session expired. Please log in again.');
      setError('Authentication required. Please log in to continue.');
      return true;
    }
    if (status === 429) {
      setError('Rate limit exceeded. Please wait and try again.');
      return true;
    }
    setError(message || fallbackMessage);
    return false;
  }, []);

  const handleAudioSkip = useCallback((block: ScriptBlock) => {
    const rawText = block.text.trim();
    const snippet = rawText.length > 60 ? `${rawText.slice(0, 57)}...` : rawText;
    const label = block.type === BlockType.DIALOGUE
      ? (block.character ? block.character : 'Dialogue')
      : block.type === BlockType.ACTION
        ? 'Action'
        : 'Transition';
    const detail = snippet ? `: "${snippet}"` : '';
    setToast({ message: `Audio failed for ${label}${detail}` });
  }, []);

  const startAiRequest = useCallback(<T,>(request: CancellableRequest<T>) => {
    if (activeAiRequestRef.current) {
      activeAiRequestRef.current.cancel();
    }
    activeAiRequestRef.current = request as CancellableRequest<unknown>;
    setIsGenerating(true);
    setError(null);
  }, []);

  const finishAiRequest = useCallback(<T,>(request: CancellableRequest<T>) => {
    if (activeAiRequestRef.current === request) {
      activeAiRequestRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  const cancelAiRequest = useCallback(() => {
    if (activeAiRequestRef.current) {
      activeAiRequestRef.current.cancel();
      activeAiRequestRef.current = null;
    }
    setIsGenerating(false);
    setError(null);
  }, []);

  const openPrivacy = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/privacy') {
      lastNonPrivacyPathRef.current = window.location.pathname || '/';
      window.history.pushState({}, '', '/privacy');
    }
    setIsPrivacyOpen(true);
  };

  const closePrivacy = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/privacy') {
      const targetPath = lastNonPrivacyPathRef.current || '/';
      window.history.pushState({}, '', targetPath);
    }
    setIsPrivacyOpen(false);
  };

  // Custom Hooks
  const { 
    isPlaying,
    isPaused,
    isPreviewPlaying, 
    currentBlockId, 
    currentBlockIndex,
    isLoadingAudio, 
    bufferedCount,
    totalBufferedCount,
    isBuffering,
    blockStatuses,
    playScript, 
    bufferScript,
    playPreview, 
    stop,
    pause,
    resume,
    goToNext,
    goToPrevious,
    retryCurrentBlock,
    skipCurrentBlock
  } = useAudioPlayer(voiceConfigs, handleAiError, handleAudioSkip);

  // Clear preview state when playback ends
  useEffect(() => {
    if (!isPreviewPlaying && !isLoadingAudio) {
      setPreviewVoiceId(null);
    }
  }, [isPreviewPlaying, isLoadingAudio]);

  // Toast Auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Initialize Voices when characters change
  useEffect(() => {
    if (context?.characters) {
      const newConfigs = [...voiceConfigs];
      
      // Ensure Narrator exists
      if (!newConfigs.find(c => c.name === 'Narrator')) {
        newConfigs.push({ name: 'Narrator', voiceId: 'Zephyr', speed: playbackSpeed, pitch: 0 });
      }

      context.characters.forEach((char, idx) => {
        if (!newConfigs.find(c => c.name.toLowerCase() === char.toLowerCase())) {
          const voice = AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length];
          newConfigs.push({ name: char, voiceId: voice, speed: playbackSpeed, pitch: 0 });
        }
      });
      setVoiceConfigs(newConfigs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.characters]);

  useEffect(() => {
    if (context) {
      setSetupState(prev => ({
        ...prev,
        genre: context.genre,
        premise: context.premise,
        characters: context.characters
      }));
    }
  }, [context]);

  useEffect(() => {
    setInsertTarget(null);
  }, [context]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        await getSession();
        if (active) {
          setAuthStatus('authenticated');
          setAuthError(null);
        }
      } catch {
        if (active) {
          setAuthStatus('unauthenticated');
        }
      }
    };
    checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentPath = window.location.pathname;
    lastNonPrivacyPathRef.current = currentPath === '/privacy' ? '/' : currentPath;
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path !== '/privacy') {
        lastNonPrivacyPathRef.current = path || '/';
      }
      setIsPrivacyOpen(path === '/privacy');
    };
    setIsPrivacyOpen(currentPath === '/privacy');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!storedDraft) {
      didHydrateDraftRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(storedDraft) as DraftPayload;
      if (parsed && isStoryContext(parsed.context)) {
        setContext(parsed.context);
        if (typeof parsed.userInstruction === 'string') {
          setUserInstruction(parsed.userInstruction);
        }
      } else {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      didHydrateDraftRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!context || !didHydrateDraftRef.current || typeof window === 'undefined') return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      const payload: DraftPayload = {
        context,
        userInstruction,
        savedAt: new Date().toISOString()
      };
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
        autosaveFailureNotifiedRef.current = false;
        setAutosaveError(null);
      } catch (err) {
        console.warn('Failed to save draft', err);
        if (!autosaveFailureNotifiedRef.current) {
          autosaveFailureNotifiedRef.current = true;
          setAutosaveError('Autosave failed; consider exporting.');
        }
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [context, userInstruction]);

  const handleLogin = async (password: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await login(password);
      setAuthStatus('authenticated');
      setError(null);
    } catch (err: unknown) {
      const { status, message } = getErrorMeta(err);
      if (status === 401) {
        setAuthError('Incorrect password.');
      } else {
        setAuthError(message || 'Login failed.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleClearDraft = () => {
    if (!context) return;
    const proceed = window.confirm('Clear the saved draft from this browser?');
    if (!proceed) return;
    cancelAiRequest();
    stop({ clearBuffer: true });
    setContext(null);
    setUserInstruction('');
    setVoiceConfigs([]);
    setSetupState(DEFAULT_SETUP_STATE);
    setOpenPanels({ setup: true, voices: false, playback: false });
    setHasReviewedVoices(false);
    setInsertTarget(null);
    setError(null);
    setToast(null);
    setAutosaveError(null);
    autosaveFailureNotifiedRef.current = false;
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear draft', err);
    }
  };

  const handleEditSetup = () => {
    if (!context) return;
    cancelAiRequest();
    stop({ clearBuffer: true });
    setContext(null);
    setUserInstruction('');
    setVoiceConfigs([]);
    setOpenPanels({ setup: true, voices: false, playback: false });
    setHasReviewedVoices(false);
    setInsertTarget(null);
    setError(null);
    setToast(null);
    setAutosaveError(null);
    autosaveFailureNotifiedRef.current = false;
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear draft', err);
    }
  };

  // Handlers
  const handleStart = async () => {
    if (isGenerating) return;
    let request: CancellableRequest<Scene> | null = null;
    try {
      const setupNotes: string[] = [];
      if (setupState.style.trim()) {
        setupNotes.push(`Style: ${setupState.style.trim()}.`);
      }
      if (setupState.length.trim()) {
        setupNotes.push(`Target length: ${setupState.length.trim()}.`);
      }
      const instruction = `${setupNotes.join(' ')} Write the opening scene setting the tone.`.trim();
      const initialContext: StoryContext = { 
        genre: setupState.genre,
        premise: setupState.premise,
        characters: setupState.characters,
        title: 'Untitled Screenplay',
        scenes: [] 
      };
      request = createGenerateSceneRequest(
        initialContext,
        instruction,
        true
      );
      startAiRequest(request);
      const firstScene = await request.promise;
      
      setContext({
        ...initialContext,
        scenes: [firstScene]
      });
      setHasReviewedVoices(false);
    } catch (err: unknown) {
      handleAiError(err, "Failed to generate story");
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleGenerateNext = async () => {
    if (!context || isGenerating) return;
    let request: CancellableRequest<Scene> | null = null;
    try {
      const prompt = userInstruction || "Continue the story logically.";
      request = createGenerateSceneRequest(context, prompt, false);
      startAiRequest(request);
      const nextScene = await request.promise;
      setContext(prev => prev ? { ...prev, scenes: [...prev.scenes, nextScene] } : null);
      setUserInstruction('');
    } catch (err: unknown) {
      handleAiError(err, 'Failed to generate scene.');
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleTwist = async () => {
    if (!context || isGenerating) return;
    let request: CancellableRequest<string> | null = null;
    try {
      request = createSuggestPlotTwistRequest(context.genre);
      startAiRequest(request);
      const twist = await request.promise;
      setUserInstruction(`PLOT TWIST: ${twist}`);
    } catch (err: unknown) {
      console.error(err);
      handleAiError(err, 'Failed to generate plot twist.');
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleAddBlock = (block: ScriptBlock) => {
    if (!context) return;
    
    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      
      if (block.type === BlockType.HEADING) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: block.text.toUpperCase(),
          summary: "New user created scene",
          blocks: []
        };
        newScenes.push(newScene);
      } else {
        if (newScenes.length > 0) {
          const lastSceneIndex = newScenes.length - 1;
          const updatedScene = { 
            ...newScenes[lastSceneIndex],
            blocks: [...newScenes[lastSceneIndex].blocks, block]
          };
          newScenes[lastSceneIndex] = updatedScene;
        } else {
          newScenes.push({
            id: crypto.randomUUID(),
            heading: "EXT. UNKNOWN - DAY",
            summary: "Start",
            blocks: [block]
          });
        }
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const handleInsertAfter = useCallback((target: { sceneId: string; blockId: string }, block: ScriptBlock) => {
    setContext(prev => {
      if (!prev) return null;
      const sceneIndex = prev.scenes.findIndex(scene => scene.id === target.sceneId);
      if (sceneIndex === -1) return prev;

      const newScenes = [...prev.scenes];
      if (block.type === BlockType.HEADING) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: block.text.toUpperCase(),
          summary: 'New user created scene',
          blocks: []
        };
        newScenes.splice(sceneIndex + 1, 0, newScene);
        return { ...prev, scenes: newScenes };
      }

      const scene = newScenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex(b => b.id === target.blockId);
      const insertIndex = blockIndex === -1 ? scene.blocks.length : blockIndex + 1;
      const updatedBlocks = [...scene.blocks];
      updatedBlocks.splice(insertIndex, 0, block);
      newScenes[sceneIndex] = { ...scene, blocks: updatedBlocks };
      return { ...prev, scenes: newScenes };
    });
    setInsertTarget(null);
  }, []);

  const handleUndo = () => {
    if (!context || context.scenes.length === 0) return;

    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      const lastSceneIndex = newScenes.length - 1;
      const lastScene = { ...newScenes[lastSceneIndex] };

      if (lastScene.blocks.length > 0) {
        lastScene.blocks = lastScene.blocks.slice(0, -1);
        newScenes[lastSceneIndex] = lastScene;
      } else {
        newScenes.pop();
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const handleToggleLock = useCallback((sceneId: string, blockId: string) => {
    setContext(prev => {
      if (!prev) return null;
      const newScenes = prev.scenes.map(scene => {
        if (scene.id !== sceneId) return scene;
        return {
          ...scene,
          blocks: scene.blocks.map(b => b.id === blockId ? { ...b, locked: !b.locked } : b)
        };
      });
      return { ...prev, scenes: newScenes };
    });
  }, []);

  const handleChangeSpeaker = useCallback((sceneId: string, blockId: string, character: string) => {
    setContext(prev => {
      if (!prev) return null;
      return {
        ...prev,
        scenes: prev.scenes.map(scene => scene.id === sceneId ? {
          ...scene,
          blocks: scene.blocks.map(block => block.id === blockId ? { ...block, character } : block)
        } : scene)
      };
    });
  }, []);

  const handleRegenerateBlock = useCallback(async (sceneId: string, blockId: string) => {
    if (!context || isGenerating) return;

    const scene = context.scenes.find(s => s.id === sceneId);
    const block = scene?.blocks.find(b => b.id === blockId);

    if (!block || block.locked) return;

    const originalText = block.text;

    let request: CancellableRequest<string> | null = null;
    try {
      request = createRegenerateScriptBlockRequest(block, context.genre, context.premise);
      startAiRequest(request);
      const newText = await request.promise;
      
      // Update state
      setContext(prev => {
        if (!prev) return null;
        return {
          ...prev,
          scenes: prev.scenes.map(s => s.id === sceneId ? {
            ...s,
            blocks: s.blocks.map(b => b.id === blockId ? { ...b, text: newText } : b)
          } : s)
        };
      });

      // Show toast with undo
      setToast({
        message: 'Block regenerated',
        onUndo: () => {
          setContext(prev => {
            if (!prev) return null;
            return {
              ...prev,
              scenes: prev.scenes.map(s => s.id === sceneId ? {
                ...s,
                blocks: s.blocks.map(b => b.id === blockId ? { ...b, text: originalText } : b)
              } : s)
            };
          });
          setToast(null);
        }
      });

    } catch (err: unknown) {
      console.error(err);
      handleAiError(err, "Failed to regenerate block.");
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  }, [context, isGenerating, handleAiError, startAiRequest, finishAiRequest]);

  const updateVoiceConfig = (char: string, updates: Partial<VoiceConfig>) => {
    setVoiceConfigs(prev => {
      const existingIdx = prev.findIndex(c => c.name === char);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...updates };
        return updated;
      }
      return [...prev, { 
        name: char, 
        voiceId: AVAILABLE_VOICES[0], 
        speed: playbackSpeed, 
        pitch: 0,
        ...updates 
      } as VoiceConfig];
    });
  };

  const handleGlobalSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setVoiceConfigs(prev => prev.map(config => ({ ...config, speed })));
  };

  const handleTitleChange = (newTitle: string) => {
    setContext(prev => prev ? { ...prev, title: newTitle } : null);
  };

  const handlePlay = () => {
    if (!context || allBlocks.length === 0) return;
    playScript(allBlocks);
  };

  const handleDownload = () => {
    if (!context) return;

    const isUntitled = !context.title.trim() || context.title === 'Untitled Screenplay';
    
    if (isUntitled) {
      const proceed = window.confirm("You haven't given your masterpiece a title yet. Export as \"Untitled Script\"?");
      if (!proceed) {
        titleInputRef.current?.focus();
        return;
      }
    }

    const text = context.scenes.map(s => {
      return s.blocks.map(b => {
        if (b.type === 'heading') return `\n${b.text}\n`;
        if (b.type === 'dialogue') return `\n${b.character?.toUpperCase()}\n${b.parenthetical || ''}\n${b.text}\n`;
        return `\n${b.text}\n`;
      }).join('');
    }).join('\n***\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const sanitizedTitle = isUntitled ? 'untitled_script' : context.title.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const getPreviewText = (charName: string): string => {
    if (!context) return "I am a ghost in the machine.";
    for (const scene of context.scenes) {
      for (const block of scene.blocks) {
        if (block.type === BlockType.DIALOGUE && 
            block.character?.toLowerCase().trim() === charName.toLowerCase().trim()) {
          return block.text || "I am speechless.";
        }
      }
    }
    return `I am ${charName}, ready for my closeup.`;
  };

  const handleModalPreview = async (voiceId: string) => {
    if (!castingCharacter) return;
    
    if (isPreviewPlaying && previewVoiceId === voiceId) {
      stop();
      return;
    }
    
    stop();
    
    setPreviewVoiceId(voiceId);
    const text = getPreviewText(castingCharacter);
    const config: VoiceConfig = { 
      name: castingCharacter, 
      voiceId, 
      speed: playbackSpeed, 
      pitch: 0 
    };
    await playPreview(text, config);
  };

  const blockLookup = useMemo(() => {
    if (!context) return new Map<string, ScriptBlock>();
    const lookup = new Map<string, ScriptBlock>();
    context.scenes.forEach(scene => {
      scene.blocks.forEach(block => lookup.set(block.id, block));
    });
    return lookup;
  }, [context]);

  const currentBlock = currentBlockId ? blockLookup.get(currentBlockId) : null;
  const currentSpeaker = currentBlock
    ? currentBlock.type === BlockType.DIALOGUE
      ? currentBlock.character || 'Narrator'
      : 'Narrator'
    : 'None';

  const allBlocks = useMemo(
    () => (context ? context.scenes.flatMap(scene => scene.blocks) : []),
    [context]
  );

  const expectedVoices = context ? context.characters.length + 1 : 0;
  const voicesReady = context ? voiceConfigs.length >= expectedVoices : false;
  const voicesAssigned = Boolean(context) && voicesReady && hasReviewedVoices;
  const voiceReviewPending = Boolean(context) && voicesReady && !hasReviewedVoices;
  const bufferedBlocks = bufferedCount;
  const totalBufferedBlocks = totalBufferedCount;
  const errorBlocks = Object.values(blockStatuses).filter(status => status === 'error').length;
  const readyOrErrorBlocks = bufferedBlocks + errorBlocks;
  const pendingBlocks = Math.max(totalBufferedBlocks - readyOrErrorBlocks, 0);
  const audioBuffered = totalBufferedBlocks > 0 && readyOrErrorBlocks >= totalBufferedBlocks;
  const hasScript = allBlocks.length > 0;
  const setupReady = setupState.premise.trim().length > 0 && setupState.characters.some(char => char.trim().length > 0);

  const currentStep: ControlStep = (() => {
    if (!hasScript) {
      return setupReady ? 'script' : 'setup';
    }
    if (!voicesAssigned) {
      return 'voices';
    }
    return 'playback';
  })();

  useEffect(() => {
    const nextPanels = {
      setup: currentStep === 'setup' || currentStep === 'script',
      voices: currentStep === 'voices',
      playback: currentStep === 'playback'
    };
    setOpenPanels(prev => {
      if (
        prev.setup === nextPanels.setup &&
        prev.voices === nextPanels.voices &&
        prev.playback === nextPanels.playback
      ) {
        return prev;
      }
      return nextPanels;
    });
  }, [currentStep]);

  const handlePanelToggle = (panel: 'setup' | 'voices' | 'playback') =>
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      const isOpen = (event.currentTarget as HTMLDetailsElement).open;
      setOpenPanels(prev => ({ ...prev, [panel]: isOpen }));
      if (panel === 'voices' && isOpen) {
        setHasReviewedVoices(true);
      }
    };

  const openVoicesPanel = () => {
    setOpenPanels({ setup: false, voices: true, playback: false });
    setHasReviewedVoices(true);
  };

  const openPlaybackPanel = () => {
    setOpenPanels({ setup: false, voices: false, playback: true });
  };

  const isGeneratingAudio = (pendingBlocks > 0 && isBuffering) || isLoadingAudio;

  const primaryAction = (() => {
    if (!hasScript) {
      return {
        label: 'Generate First Scene',
        helperText: setupReady
          ? 'Generate the opening scene to start the draft.'
          : 'Pick a premise and cast to begin.',
        onClick: handleStart,
        disabled: isGenerating || !setupState.premise.trim(),
        loading: isGenerating
      };
    }
    if (!voicesAssigned) {
      return {
        label: 'Assign Voices',
        helperText: 'Assign a voice to each character.',
        onClick: openVoicesPanel,
        disabled: false,
        loading: false
      };
    }
    if (!audioBuffered) {
      return {
        label: isGeneratingAudio ? 'Generating Audio...' : 'Generate Audio',
        helperText: 'Generate audio so playback is ready.',
        onClick: () => {
          openPlaybackPanel();
          if (allBlocks.length > 0) {
            bufferScript(allBlocks);
          }
        },
        disabled: isGeneratingAudio || allBlocks.length === 0,
        loading: isGeneratingAudio
      };
    }
    if (isPlaying) {
      return {
        label: 'Pause',
        helperText: 'Playback is running.',
        onClick: pause,
        disabled: false,
        loading: false
      };
    }
    if (isPaused) {
      return {
        label: 'Resume',
        helperText: 'Playback is paused.',
        onClick: resume,
        disabled: false,
        loading: false
      };
    }
    return {
      label: 'Play',
      helperText: 'Audio is ready for performance.',
      onClick: handlePlay,
      disabled: false,
      loading: false
    };
  })();

  const unassignedVoices = voiceReviewPending
    ? expectedVoices
    : Math.max(expectedVoices - voiceConfigs.length, 0);
  const setupBadge = context ? 'Locked' : setupReady ? 'Ready' : 'Start';
  const voicesBadge = context
    ? (voicesAssigned ? 'Ready' : `Unassigned: ${unassignedVoices}`)
    : 'Locked';
  const totalAudioBlocks = Math.max(totalBufferedBlocks, allBlocks.length);
  const playbackBadge = !context
    ? 'Not generated'
    : audioBuffered
      ? errorBlocks > 0
        ? `Audio ready ${readyOrErrorBlocks}/${totalBufferedBlocks} (${errorBlocks} errors)`
        : `Audio ready ${readyOrErrorBlocks}/${totalBufferedBlocks}`
      : isGeneratingAudio
        ? `Generating ${readyOrErrorBlocks}/${totalAudioBlocks || 0}`
        : 'Not generated';

  const summaryBase = 'cursor-pointer list-none flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold transition-colors';
  const summaryActive = 'bg-gray-900/70 border-indigo-500/40 text-white shadow-[0_0_20px_rgba(79,70,229,0.15)]';
  const summaryInactive = 'bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200';
  const isSetupActive = currentStep === 'setup' || currentStep === 'script';
  const isVoicesActive = currentStep === 'voices';
  const isPlaybackActive = currentStep === 'playback';
  const setupMetaParts = [setupState.genre, setupState.length, setupState.style.trim()].filter(Boolean);
  const setupMetaLine = setupMetaParts.join(' / ');
  const setupCastCount = setupState.characters.filter(char => char.trim().length > 0).length;
  const setupPremiseText = setupState.premise.trim();
  const setupPremiseSnippet = setupPremiseText.length > 60 ? `${setupPremiseText.slice(0, 60)}...` : setupPremiseText;

  const privacyModal = (
    <PrivacyModal isOpen={isPrivacyOpen} onClose={closePrivacy} />
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col lg:flex-row overflow-hidden relative">
      <ScriptPane
        context={context}
        titleInputRef={titleInputRef}
        onTitleChange={handleTitleChange}
        onClearDraft={handleClearDraft}
        autosaveError={autosaveError}
        error={error}
        userInstruction={userInstruction}
        onInstructionChange={setUserInstruction}
        onGenerateNext={handleGenerateNext}
        onPlotTwist={handleTwist}
        onAddBlock={handleAddBlock}
        onUndo={handleUndo}
        insertTarget={insertTarget}
        onInsertAfter={handleInsertAfter}
        onCancelInsertTarget={() => setInsertTarget(null)}
        onSelectInsertTarget={handleSelectInsertTarget}
        onChangeSpeaker={handleChangeSpeaker}
        onInsertError={(err) => handleAiError(err, 'Failed to generate block.')}
        onRegenerate={handleRegenerateBlock}
        onToggleLock={handleToggleLock}
        isGenerating={isGenerating}
        isPlaying={isPlaying}
        isRegenerating={isGenerating}
        onCancelGenerate={cancelAiRequest}
        currentBlockId={currentBlockId}
        currentBlockIndex={currentBlockIndex}
        blockStatuses={blockStatuses}
        showHighlights={showHighlights}
        autoScroll={autoScroll}
        onOpenPrivacy={openPrivacy}
      />

      <ControlPanel
        currentStep={currentStep}
        primaryAction={primaryAction}
        footer={(
          <Button
            variant="ghost"
            onClick={handleDownload}
            className="w-full text-xs py-2 h-auto hover:bg-gray-700"
            disabled={!context}
            title="Export script as a .txt file"
          >
            <Download className="w-3 h-3 mr-2" /> Export Script (.txt)
          </Button>
        )}
      >
        <details open={openPanels.setup} onToggle={handlePanelToggle('setup')} className="group">
          <summary className={`${summaryBase} ${isSetupActive ? summaryActive : summaryInactive}`}>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <span>Setup</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    isSetupActive
                      ? 'border-indigo-500/40 text-indigo-200 bg-indigo-500/10'
                      : 'border-gray-700/70 text-gray-500 bg-gray-900/40'
                  }`}
                >
                  {setupBadge}
                </span>
              </div>
              {context && (
                <div className="mt-1 text-[10px] text-gray-500">
                  <span>
                    {setupMetaLine ? `${setupMetaLine} / ` : ''}
                    Cast: {setupCastCount}
                  </span>
                  {setupPremiseSnippet && (
                    <span className="text-gray-600"> - &quot;{setupPremiseSnippet}&quot;</span>
                  )}
                </div>
              )}
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-3">
            <SetupForm
              value={setupState}
              onChange={updateSetupState}
              onStart={handleStart}
              isLoading={isGenerating}
              onError={handleAiError}
              isLocked={Boolean(context)}
              showSubmit={false}
              onEditSetup={handleEditSetup}
              onClearDraft={handleClearDraft}
            />
          </div>
        </details>

        <details open={openPanels.voices} onToggle={handlePanelToggle('voices')} className="group">
          <summary className={`${summaryBase} ${isVoicesActive ? summaryActive : summaryInactive}`}>
            <div className="flex items-center gap-3">
              <span>Voices</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isVoicesActive
                    ? 'border-indigo-500/40 text-indigo-200 bg-indigo-500/10'
                    : 'border-gray-700/70 text-gray-500 bg-gray-900/40'
                }`}
              >
                {voicesBadge}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4">
            {context ? (
              <VoicesPanel
                characters={context.characters}
                voiceConfigs={voiceConfigs}
                onUpdateConfig={updateVoiceConfig}
                onOpenCasting={setCastingCharacter}
                onPreview={(config) => playPreview(getPreviewText(config.name), config)}
                onStop={stop}
                isAudioPlaying={isPreviewPlaying && !castingCharacter}
                isLoading={isLoadingAudio && !isPlaying && !castingCharacter}
                onReviewed={() => setHasReviewedVoices(true)}
              />
            ) : (
              <p className="text-[11px] text-gray-500">Generate a script to unlock voice casting.</p>
            )}
          </div>
        </details>

        <details open={openPanels.playback} onToggle={handlePanelToggle('playback')} className="group">
          <summary className={`${summaryBase} ${isPlaybackActive ? summaryActive : summaryInactive}`}>
            <div className="flex items-center gap-3">
              <span>Playback</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isPlaybackActive
                    ? 'border-indigo-500/40 text-indigo-200 bg-indigo-500/10'
                    : 'border-gray-700/70 text-gray-500 bg-gray-900/40'
                }`}
              >
                {playbackBadge}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4">
            {context ? (
              <PlaybackPanel
                isPlaying={isPlaying}
                isPaused={isPaused}
                isLoadingAudio={isLoadingAudio}
                currentBlockId={currentBlockId}
                currentBlockIndex={currentBlockIndex}
                blockStatuses={blockStatuses}
                onPlay={handlePlay}
                onPause={pause}
                onResume={resume}
                onStop={stop}
                onPrev={goToPrevious}
                onNext={goToNext}
                onRetry={retryCurrentBlock}
                onSkip={skipCurrentBlock}
                bufferedCount={bufferedBlocks}
                totalCount={totalBufferedBlocks}
                currentSpeaker={currentSpeaker}
                playbackSpeed={playbackSpeed}
                onPlaybackSpeedChange={handleGlobalSpeedChange}
                showHighlights={showHighlights}
                onToggleHighlights={() => setShowHighlights(!showHighlights)}
                autoScroll={autoScroll}
                onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
              />
            ) : (
              <p className="text-[11px] text-gray-500">Generate a script to begin playback.</p>
            )}
          </div>
        </details>
      </ControlPanel>

      {toast && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 fade-in z-50">
          <span className="text-sm font-medium">{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={toast.onUndo}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 px-2 py-1 rounded flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
          )}
        </div>
      )}

      {castingCharacter && (
        <VoiceCastingModal
          isOpen={true}
          onClose={() => {
            stop();
            setCastingCharacter(null);
          }}
          characterName={castingCharacter}
          currentVoiceId={voiceConfigs.find(c => c.name === castingCharacter)?.voiceId || AVAILABLE_VOICES[0]}
          voiceConfigs={voiceConfigs}
          onSelect={(voiceId) => {
            updateVoiceConfig(castingCharacter, { voiceId });
            stop();
            setCastingCharacter(null);
          }}
          onPreview={handleModalPreview}
          isPreviewing={isPreviewPlaying || isLoadingAudio}
          previewVoiceId={previewVoiceId}
        />
      )}

      <LoginModal
        isOpen={authStatus === 'unauthenticated'}
        isLoading={isAuthLoading}
        error={authError}
        onLogin={handleLogin}
      />
      {privacyModal}
    </div>
  );
}
