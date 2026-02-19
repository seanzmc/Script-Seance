import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SetupFormState } from './components/SetupForm';
import { ScriptPane } from './components/ScriptPane';
import { openScriptExportWindow, SCRIPT_EXPORT_ROOT_SELECTOR } from './components/ScriptDisplay';
import { VoicesPanel } from './components/VoicesPanel';
import { PlaybackPanel } from './components/PlaybackPanel';
import { VoiceCastingModal } from './components/VoiceCastingModal';
import { LoginModal } from './components/LoginModal';
import { PrivacyModal } from './components/PrivacyModal';
import {
  createGenerateSceneRequest,
  createSuggestPlotTwistRequest,
  createRegenerateScriptBlockRequest,
  CancellableRequest,
  generateScriptElement,
  listVoices
} from './services/ai';
import { getSession, login } from './services/auth';
import {
  Scene,
  SceneLengthOption,
  StoryContext,
  VoiceConfig,
  LEGACY_VOICE_IDS,
  DEFAULT_NARRATOR_VOICE_ID,
  TtsVoice,
  VoiceCatalogState,
  ScriptBlock,
  BlockType,
  GENRES,
  INSERT_TOP_ID,
  INSERT_BOTTOM_ID
} from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { RotateCcw } from 'lucide-react';

interface ToastState {
  message: string;
  onUndo?: () => void;
}

interface DraftPayload {
  context: StoryContext;
  userInstruction: string;
  savedAt: string;
}

type RedoPayload =
  | { type: 'block'; sceneId: string; block: ScriptBlock; index: number }
  | { type: 'scene'; scene: Scene; index: number };
type UndoAction = RedoPayload;

const DRAFT_STORAGE_KEY = 'script-seance:draft:v1';
const DRAFT_DEBOUNCE_MS = 800;
const DEFAULT_TITLE = 'Untitled Screenplay';
const DEFAULT_SETUP_STATE: SetupFormState = {
  genre: GENRES[0],
  premise: '',
  characters: ['Hero', 'Villain'],
  style: '',
  length: 'Medium'
};
const SCENE_LENGTH_OPTIONS = new Set<SceneLengthOption>(['Short', 'Medium', 'Long']);

const normalizeTargetLength = (value: unknown): SceneLengthOption => (
  typeof value === 'string' && SCENE_LENGTH_OPTIONS.has(value as SceneLengthOption)
    ? value as SceneLengthOption
    : 'Medium'
);

const isStoryContext = (value: unknown): value is StoryContext => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const style = record.style;
  const targetLength = record.targetLength;
  const styleOk = style === undefined || style === null || typeof style === 'string';
  const targetLengthOk =
    targetLength === undefined ||
    targetLength === null ||
    (typeof targetLength === 'string' && SCENE_LENGTH_OPTIONS.has(targetLength as SceneLengthOption));
  return (
    typeof record.title === 'string' &&
    typeof record.genre === 'string' &&
    typeof record.premise === 'string' &&
    Array.isArray(record.characters) &&
    Array.isArray(record.scenes) &&
    styleOk &&
    targetLengthOk
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

const isUntitledTitle = (title: string) => !title.trim() || title.trim() === DEFAULT_TITLE;

const sanitizeSuggestedTitle = (rawTitle: string) => {
  if (!rawTitle) return '';
  const firstLine = rawTitle.split('\n').map(line => line.trim()).find(Boolean) || '';
  const withoutLabel = firstLine.replace(/^title\s*[:-]\s*/i, '');
  const withoutQuotes = withoutLabel.replace(/^["'“”]+|["'“”]+$/g, '');
  const collapsed = withoutQuotes.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  if (/^(int|ext)\./i.test(collapsed)) return '';
  return collapsed.length > 120 ? collapsed.slice(0, 120).replace(/[,\s]+$/g, '') : collapsed;
};

const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

const resolveCharacterName = (value: string | null | undefined, characters: string[]) => {
  if (!value) return value ?? undefined;
  const normalized = normalizeCharacterName(value);
  const match = characters.find(char => normalizeCharacterName(char) === normalized);
  return match ?? value;
};

const normalizeSceneCharacters = (scene: Scene, characters: string[]) => ({
  ...scene,
  blocks: scene.blocks.map(block => (
    block.character
      ? { ...block, character: resolveCharacterName(block.character, characters) }
      : block
  ))
});

const getVoiceIdList = (voices: TtsVoice[]) =>
  voices.length > 0 ? voices.map((voice) => voice.id) : LEGACY_VOICE_IDS;

const getDefaultNarratorVoiceId = (voices: TtsVoice[]) => {
  if (voices.length === 0) return DEFAULT_NARRATOR_VOICE_ID;
  const preferred = voices.find((voice) =>
    voice.labels.some((label) => ['narrator', 'calm', 'neutral', 'professional'].includes(label.toLowerCase()))
  );
  if (preferred) return preferred.id;
  return voices[0].id;
};

const buildFallbackTitle = (premise: string, genre: string) => {
  const words = premise
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) {
    return genre ? `${genre} Story` : '';
  }
  return words.map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

const buildTitleContext = (setup: SetupFormState) => {
  const parts = [
    setup.genre ? `Genre: ${setup.genre}.` : '',
    setup.premise.trim() ? `Premise: ${setup.premise.trim()}` : '',
    setup.characters.length ? `Characters: ${setup.characters.filter(char => char.trim()).join(', ')}.` : '',
    setup.style.trim() ? `Style: ${setup.style.trim()}.` : '',
    setup.length.trim() ? `Length: ${setup.length.trim()}.` : ''
  ].filter(Boolean);
  return parts.join(' ');
};

export const buildScriptTextExport = (scenes: Scene[]) => (
  scenes
    .map(scene => {
      const lines: string[] = [];
      const heading = scene.heading.trim();
      if (heading) {
        lines.push(`\n${heading.toUpperCase()}\n`);
      }
      scene.blocks.forEach(block => {
        if (block.type === BlockType.HEADING) {
          return;
        }
        if (block.type === BlockType.DIALOGUE) {
          const speaker = block.character?.trim().toUpperCase() || 'UNKNOWN';
          lines.push(`\n${speaker}\n`);
          if (block.parenthetical?.trim()) {
            lines.push(`${block.parenthetical.trim()}\n`);
          }
          lines.push(`${block.text}\n`);
          return;
        }
        lines.push(`\n${block.text}\n`);
      });
      return lines.join('');
    })
    .join('\n***\n')
);

export default function App() {
  // State
  const [context, setContext] = useState<StoryContext | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceConfigs, setVoiceConfigs] = useState<VoiceConfig[]>([]);
  const [availableVoices, setAvailableVoices] = useState<TtsVoice[]>([]);
  const [voiceCatalogState, setVoiceCatalogState] = useState<VoiceCatalogState>('idle');
  const [userInstruction, setUserInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [suggestedTitleDismissed, setSuggestedTitleDismissed] = useState(false);
  const activeAiRequestRef = useRef<CancellableRequest<unknown> | null>(null);
  const titleSuggestionTokenRef = useRef(0);
  const hasManualTitleRef = useRef(false);

  const [setupState, setSetupState] = useState<SetupFormState>(DEFAULT_SETUP_STATE);
  const [insertTarget, setInsertTarget] = useState<{ sceneId: string; blockId: string } | null>(null);
  const [insertModeActive, setInsertModeActive] = useState(false);
  const [pendingInsertBlock, setPendingInsertBlock] = useState<ScriptBlock | null>(null);
  const [insertCompleteToken, setInsertCompleteToken] = useState(0);
  const [insertScrollToken, setInsertScrollToken] = useState(0);
  const [insertScrollTargetId, setInsertScrollTargetId] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupAutoSurprise, setSetupAutoSurprise] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const undoStackRef = useRef<UndoAction[]>([]);
  const redoStackRef = useRef<UndoAction[]>([]);

  // Playback Settings
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Voices tool view state
  const [voicesView, setVoicesView] = useState<'list' | 'casting'>('list');
  const [castingCharacter, setCastingCharacter] = useState<string | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const didHydrateDraftRef = useRef(false);
  const lastNonPrivacyPathRef = useRef('/');
  const autosaveFailureNotifiedRef = useRef(false);

  const canRedo = redoCount > 0;
  const canUndo = undoCount > 0;
  const scriptStyleContext = useMemo(() => {
    const style = setupState.style.trim();
    const length = setupState.length.trim();
    const parts = [
      setupState.genre ? `Genre: ${setupState.genre}.` : '',
      style ? `Style: ${style}.` : '',
      length ? `Length: ${length}.` : ''
    ].filter(Boolean);
    return parts.join(' ');
  }, [setupState.genre, setupState.length, setupState.style]);

  const applyUndoAction = useCallback((current: StoryContext, action: UndoAction) => {
    if (action.type === 'scene') {
      const sceneIndex = current.scenes.findIndex(scene => scene.id === action.scene.id);
      if (sceneIndex === -1) {
        return { nextContext: current, applied: false };
      }
      const nextScenes = [...current.scenes];
      nextScenes.splice(sceneIndex, 1);
      return { nextContext: { ...current, scenes: nextScenes }, applied: true };
    }

    const sceneIndex = current.scenes.findIndex(scene => scene.id === action.sceneId);
    if (sceneIndex === -1) {
      return { nextContext: current, applied: false };
    }
    const scene = current.scenes[sceneIndex];
    const blockIndex = scene.blocks.findIndex(block => block.id === action.block.id);
    if (blockIndex === -1) {
      return { nextContext: current, applied: false };
    }
    const nextBlocks = [...scene.blocks];
    nextBlocks.splice(blockIndex, 1);
    const nextScenes = [...current.scenes];
    nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
    return { nextContext: { ...current, scenes: nextScenes }, applied: true };
  }, []);

  const applyRedoAction = useCallback((current: StoryContext, action: UndoAction) => {
    if (action.type === 'scene') {
      const existing = current.scenes.some(scene => scene.id === action.scene.id);
      if (existing) {
        return { nextContext: current, applied: false };
      }
      const nextScenes = [...current.scenes];
      const insertIndex = Math.min(action.index, nextScenes.length);
      nextScenes.splice(insertIndex, 0, action.scene);
      return { nextContext: { ...current, scenes: nextScenes }, applied: true };
    }

    const sceneIndex = current.scenes.findIndex(scene => scene.id === action.sceneId);
    if (sceneIndex === -1) {
      return { nextContext: current, applied: false };
    }
    const scene = current.scenes[sceneIndex];
    const alreadyExists = scene.blocks.some(block => block.id === action.block.id);
    if (alreadyExists) {
      return { nextContext: current, applied: false };
    }
    const nextBlocks = [...scene.blocks];
    const insertIndex = Math.min(action.index, nextBlocks.length);
    nextBlocks.splice(insertIndex, 0, action.block);
    const nextScenes = [...current.scenes];
    nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
    return { nextContext: { ...current, scenes: nextScenes }, applied: true };
  }, []);

  const clearRedo = useCallback(() => {
    redoStackRef.current = [];
    setRedoCount(0);
  }, []);
  const resetUndoRedo = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, []);
  const pushUndoAction = useCallback((action: UndoAction) => {
    undoStackRef.current.push(action);
    setUndoCount(undoStackRef.current.length);
  }, []);
  const popUndoAction = useCallback(() => {
    const action = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    return action;
  }, []);
  const pushRedoAction = useCallback((action: UndoAction) => {
    redoStackRef.current.push(action);
    setRedoCount(redoStackRef.current.length);
  }, []);
  const popRedoAction = useCallback(() => {
    const action = redoStackRef.current.pop();
    setRedoCount(redoStackRef.current.length);
    return action;
  }, []);

  const openManualSetup = () => {
    setSetupAutoSurprise(false);
    setIsSetupOpen(true);
  };

  const closeSetup = () => {
    setIsSetupOpen(false);
    setSetupAutoSurprise(false);
  };

  const updateSetupState = useCallback((next: Partial<SetupFormState>) => {
    setSetupState(prev => ({ ...prev, ...next }));
  }, []);
  const handleSelectInsertTarget = useCallback((target: { sceneId: string; blockId: string }) => {
    if (!insertModeActive) return;
    setInsertTarget(target);
  }, [insertModeActive]);

  const handleStartInsertMode = useCallback((block: ScriptBlock) => {
    setPendingInsertBlock(block);
    setInsertTarget(null);
    setInsertModeActive(true);
  }, []);

  const handleCancelInsertMode = useCallback(() => {
    setInsertModeActive(false);
    setPendingInsertBlock(null);
    setInsertTarget(null);
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
    blockStatuses,
    playScript, 
    clearGeneratedAudio,
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
    if (!context?.characters) return;
    const voiceIds = getVoiceIdList(availableVoices);
    const narratorVoiceId = getDefaultNarratorVoiceId(availableVoices);

    setVoiceConfigs((prev) => {
      const next = [...prev];
      const hasVoiceConfig = (name: string) =>
        next.some(config => normalizeCharacterName(config.name) === normalizeCharacterName(name));

      if (!hasVoiceConfig('Narrator')) {
        next.push({
          name: 'Narrator',
          voiceId: narratorVoiceId,
          speed: playbackSpeed,
          pitch: 0,
          expressive: false
        });
      }

      context.characters.forEach((char, idx) => {
        if (!hasVoiceConfig(char)) {
          const voice = voiceIds[idx % voiceIds.length] || narratorVoiceId;
          next.push({ name: char, voiceId: voice, speed: playbackSpeed, pitch: 0, expressive: false });
        }
      });

      return next;
    });
  }, [availableVoices, context?.characters, playbackSpeed]);

  useEffect(() => {
    if (context) {
      setSetupState(prev => ({
        ...prev,
        genre: context.genre,
        premise: context.premise,
        characters: context.characters,
        style: typeof context.style === 'string' ? context.style : prev.style,
        length: normalizeTargetLength(context.targetLength)
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
    if (authStatus !== 'authenticated') return;
    let isActive = true;
    const loadVoiceCatalog = async () => {
      setVoiceCatalogState('loading');
      try {
        const voices = await listVoices();
        if (!isActive) return;
        setAvailableVoices(voices);
        setVoiceCatalogState('ready');
      } catch (err) {
        console.error('Failed to load voices', err);
        if (!isActive) return;
        setAvailableVoices([]);
        setVoiceCatalogState('error');
      }
    };
    loadVoiceCatalog();
    return () => {
      isActive = false;
    };
  }, [authStatus]);

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
        const hydratedContext: StoryContext = {
          ...parsed.context,
          scenes: parsed.context.scenes.map(scene => normalizeSceneCharacters(scene, parsed.context.characters))
        };
        setContext(hydratedContext);
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

  useEffect(() => {
    if (!context) {
      setVoicesView('list');
      setCastingCharacter(null);
      return;
    }
    if (!castingCharacter) {
      setVoicesView('list');
      return;
    }
    const isKnownCharacter = normalizeCharacterName(castingCharacter) === normalizeCharacterName('Narrator')
      || context.characters.some((character) => (
        normalizeCharacterName(character) === normalizeCharacterName(castingCharacter)
      ));
    if (!isKnownCharacter) {
      setVoicesView('list');
      setCastingCharacter(null);
    }
  }, [castingCharacter, context]);

  useEffect(() => {
    if (!context || !suggestedTitle || suggestedTitleDismissed) return;
    if (hasManualTitleRef.current) return;
    if (!isUntitledTitle(context.title)) return;
    setContext(prev => prev ? { ...prev, title: suggestedTitle } : prev);
  }, [context, suggestedTitle, suggestedTitleDismissed]);

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
    closeSetup();
    cancelAiRequest();
    stop({ clearBuffer: true });
    resetTitleSuggestionState();
    resetUndoRedo();
    setContext(null);
    setUserInstruction('');
    setVoiceConfigs([]);
    setSetupState(DEFAULT_SETUP_STATE);
    setInsertTarget(null);
    setInsertModeActive(false);
    setPendingInsertBlock(null);
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

  const requestTitleSuggestion = useCallback(async (setup: SetupFormState) => {
    if (!setup.premise.trim()) return;
    const token = titleSuggestionTokenRef.current + 1;
    titleSuggestionTokenRef.current = token;
    setIsSuggestingTitle(true);
    try {
      const contextText = buildTitleContext(setup);
      const instruction = [
        'Create a concise, evocative screenplay title (2-6 words).',
        'Return only the title text, no quotes.',
        'Avoid scene headings like INT./EXT.'
      ].join(' ');
      const rawTitle = await generateScriptElement(BlockType.ACTION, undefined, instruction, contextText);
      if (titleSuggestionTokenRef.current !== token) return;
      const cleanedTitle = sanitizeSuggestedTitle(rawTitle);
      const finalTitle = cleanedTitle || buildFallbackTitle(setup.premise, setup.genre);
      if (!finalTitle || finalTitle === DEFAULT_TITLE) return;
      setSuggestedTitle(finalTitle);
      setSuggestedTitleDismissed(false);
      if (!hasManualTitleRef.current) {
        setContext(prev => {
          if (!prev || !isUntitledTitle(prev.title)) return prev;
          return { ...prev, title: finalTitle };
        });
      }
    } catch (err) {
      console.error('Title suggestion failed', err);
    } finally {
      if (titleSuggestionTokenRef.current === token) {
        setIsSuggestingTitle(false);
      }
    }
  }, []);

  // Handlers
  const handleStart = async () => {
    if (isGenerating) return;
    const normalizedCharacters = setupState.characters
      .map(character => character.trim())
      .filter(Boolean);
    if (normalizedCharacters.length === 0) {
      setError('Add at least one character before generating a script.');
      return;
    }
    let request: CancellableRequest<Scene> | null = null;
    try {
      closeSetup();
      resetUndoRedo();
      resetTitleSuggestionState();
      void requestTitleSuggestion(setupState);
      const instruction = 'Write the opening scene setting the tone.';
      const initialContext: StoryContext = { 
        genre: setupState.genre,
        premise: setupState.premise,
        characters: normalizedCharacters,
        title: DEFAULT_TITLE,
        scenes: [],
        style: setupState.style.trim() || undefined,
        targetLength: normalizeTargetLength(setupState.length)
      };
      request = createGenerateSceneRequest(
        initialContext,
        instruction,
        true
      );
      startAiRequest(request);
      const firstScene = await request.promise;
      const normalizedFirstScene = normalizeSceneCharacters(firstScene, initialContext.characters);
      const initialLastBlockId = normalizedFirstScene.blocks[normalizedFirstScene.blocks.length - 1]?.id;
      setContext({
        ...initialContext,
        scenes: [normalizedFirstScene]
      });
      setInsertScrollTargetId(initialLastBlockId ?? 'bottom');
      setInsertScrollToken(token => token + 1);
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
      clearRedo();
      const prompt = userInstruction || "Continue the story logically.";
      request = createGenerateSceneRequest(context, prompt, false);
      startAiRequest(request);
      const nextScene = await request.promise;
      const normalizedScene = normalizeSceneCharacters(nextScene, context.characters);
      const lastBlockId = normalizedScene.blocks[normalizedScene.blocks.length - 1]?.id;
      setContext(prev => {
        if (!prev) return null;
        const updatedScenes = [...prev.scenes, normalizedScene];
        return { ...prev, scenes: updatedScenes };
      });
      setInsertScrollTargetId(lastBlockId ?? 'bottom');
      setInsertScrollToken(token => token + 1);
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
    clearRedo();
    setInsertScrollTargetId(block.id);
    setInsertScrollToken(token => token + 1);
    
    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      const normalizedBlock = block.character
        ? { ...block, character: resolveCharacterName(block.character, prev.characters) }
        : block;
      
      if (normalizedBlock.type === BlockType.HEADING) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: normalizedBlock.text.toUpperCase(),
          summary: "New user created scene",
          blocks: []
        };
        newScenes.push(newScene);
        pushUndoAction({ type: 'scene', scene: newScene, index: newScenes.length - 1 });
      } else {
        if (newScenes.length > 0) {
          const lastSceneIndex = newScenes.length - 1;
          const updatedScene = { 
            ...newScenes[lastSceneIndex],
            blocks: [...newScenes[lastSceneIndex].blocks, normalizedBlock]
          };
          newScenes[lastSceneIndex] = updatedScene;
          pushUndoAction({
            type: 'block',
            sceneId: updatedScene.id,
            block: normalizedBlock,
            index: updatedScene.blocks.length - 1
          });
        } else {
          const newScene: Scene = {
            id: crypto.randomUUID(),
            heading: "EXT. UNKNOWN - DAY",
            summary: "Start",
            blocks: [normalizedBlock]
          };
          newScenes.push(newScene);
          pushUndoAction({ type: 'scene', scene: newScene, index: newScenes.length - 1 });
        }
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const handleInsertAfter = useCallback((target: { sceneId: string; blockId: string }, block: ScriptBlock) => {
    clearRedo();
    setContext(prev => {
      if (!prev) return null;
      const sceneIndex = prev.scenes.findIndex(scene => scene.id === target.sceneId);
      if (sceneIndex === -1) return prev;

      const normalizedBlock = block.character
        ? { ...block, character: resolveCharacterName(block.character, prev.characters) }
        : block;
      const newScenes = [...prev.scenes];
      if (normalizedBlock.type === BlockType.HEADING) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: normalizedBlock.text.toUpperCase(),
          summary: 'New user created scene',
          blocks: []
        };
        const insertIndex = target.blockId === INSERT_TOP_ID ? sceneIndex : sceneIndex + 1;
        newScenes.splice(insertIndex, 0, newScene);
        pushUndoAction({ type: 'scene', scene: newScene, index: insertIndex });
        return { ...prev, scenes: newScenes };
      }

      const scene = newScenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex(b => b.id === target.blockId);
      const insertIndex = target.blockId === INSERT_TOP_ID
        ? 0
        : blockIndex === -1 || target.blockId === INSERT_BOTTOM_ID
          ? scene.blocks.length
          : blockIndex + 1;
      const updatedBlocks = [...scene.blocks];
      updatedBlocks.splice(insertIndex, 0, normalizedBlock);
      newScenes[sceneIndex] = { ...scene, blocks: updatedBlocks };
      pushUndoAction({ type: 'block', sceneId: scene.id, block: normalizedBlock, index: insertIndex });
      return { ...prev, scenes: newScenes };
    });
    setInsertTarget(null);
  }, [clearRedo, pushUndoAction]);

  const handleConfirmInsert = useCallback(() => {
    if (!pendingInsertBlock || !insertTarget) return;
    setInsertScrollTargetId(pendingInsertBlock.id);
    setInsertScrollToken(token => token + 1);
    handleInsertAfter(insertTarget, pendingInsertBlock);
    setPendingInsertBlock(null);
    setInsertModeActive(false);
    setInsertCompleteToken(token => token + 1);
  }, [handleInsertAfter, insertTarget, pendingInsertBlock]);

  const handleUndo = () => {
    if (!context || context.scenes.length === 0) return;
    setContext(prev => {
      if (!prev || prev.scenes.length === 0) return prev;
      const lastAction = popUndoAction();
      if (!lastAction) return prev;
      const { nextContext, applied } = applyUndoAction(prev, lastAction);
      if (!applied) {
        pushUndoAction(lastAction);
        return prev;
      }
      pushRedoAction(lastAction);
      return nextContext;
    });
  };

  const handleRedo = () => {
    setContext(prev => {
      const action = popRedoAction();
      if (!action) return prev;
      if (!prev) {
        pushRedoAction(action);
        return prev;
      }
      const { nextContext, applied } = applyRedoAction(prev, action);
      if (!applied) {
        pushRedoAction(action);
        return prev;
      }
      pushUndoAction(action);
      return nextContext;
    });
  };

  const handleToggleLock = useCallback((sceneId: string, blockId: string) => {
    clearRedo();
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
  }, [clearRedo]);

  const handleChangeSpeaker = useCallback((sceneId: string, blockId: string, character: string) => {
    clearRedo();
    setContext(prev => {
      if (!prev) return null;
      const resolvedCharacter = resolveCharacterName(character, prev.characters);
      return {
        ...prev,
        scenes: prev.scenes.map(scene => scene.id === sceneId ? {
          ...scene,
          blocks: scene.blocks.map(block => block.id === blockId ? { ...block, character: resolvedCharacter } : block)
        } : scene)
      };
    });
  }, [clearRedo]);

  const resetTitleSuggestionState = useCallback(() => {
    titleSuggestionTokenRef.current += 1;
    hasManualTitleRef.current = false;
    setSuggestedTitle(null);
    setSuggestedTitleDismissed(false);
    setIsSuggestingTitle(false);
  }, []);

  const handleRegenerateBlock = useCallback(async (sceneId: string, blockId: string, rewriteGuidance?: string) => {
    if (!context || isGenerating) return;

    const scene = context.scenes.find(s => s.id === sceneId);
    const block = scene?.blocks.find(b => b.id === blockId);

    if (!block || block.locked) return;

    const originalText = block.text;

    let request: CancellableRequest<string> | null = null;
    try {
      request = createRegenerateScriptBlockRequest(block, context.genre, context.premise, rewriteGuidance);
      startAiRequest(request);
      const newText = await request.promise;
      
      // Update state
      clearRedo();
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
      setInsertScrollTargetId(blockId);
      setInsertScrollToken(token => token + 1);

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
  }, [clearRedo, context, finishAiRequest, handleAiError, isGenerating, startAiRequest]);

  const updateVoiceConfig = (char: string, updates: Partial<VoiceConfig>) => {
    const voiceIds = getVoiceIdList(availableVoices);
    const defaultVoiceId = voiceIds[0] || DEFAULT_NARRATOR_VOICE_ID;
    let shouldClearGeneratedAudio = false;
    setVoiceConfigs(prev => {
      const normalized = normalizeCharacterName(char);
      const existingIdx = prev.findIndex(c => normalizeCharacterName(c.name) === normalized);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const current = updated[existingIdx];
        const nextConfig = { ...current, ...updates };
        const voiceChanged = typeof updates.voiceId === 'string' && updates.voiceId !== current.voiceId;
        const expressiveChanged =
          typeof updates.expressive === 'boolean' &&
          Boolean(updates.expressive) !== Boolean(current.expressive);
        if (voiceChanged || expressiveChanged) {
          shouldClearGeneratedAudio = true;
        }
        updated[existingIdx] = nextConfig;
        return updated;
      }
      if (typeof updates.voiceId === 'string' || typeof updates.expressive === 'boolean') {
        shouldClearGeneratedAudio = true;
      }
      return [...prev, { 
        name: char, 
        voiceId: defaultVoiceId,
        speed: playbackSpeed, 
        pitch: 0,
        expressive: false,
        ...updates 
      } as VoiceConfig];
    });
    if (shouldClearGeneratedAudio && totalBufferedCount > 0) {
      clearGeneratedAudio();
      setToast({
        message: `Voice updated for ${char}. Generated playback was cleared.`
      });
    }
  };

  const handleGlobalSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setVoiceConfigs(prev => prev.map(config => ({ ...config, speed })));
  };

  const applyTitle = useCallback((newTitle: string, source: 'auto' | 'user') => {
    setContext(prev => prev ? { ...prev, title: newTitle } : null);
    if (source === 'user') {
      hasManualTitleRef.current = true;
    }
  }, []);

  const handleTitleChange = (newTitle: string) => {
    applyTitle(newTitle, 'user');
  };

  const handleUseSuggestedTitle = useCallback(() => {
    if (!suggestedTitle) return;
    applyTitle(suggestedTitle, 'user');
    setSuggestedTitleDismissed(true);
  }, [applyTitle, suggestedTitle]);

  const handleDismissSuggestedTitle = useCallback(() => {
    setSuggestedTitleDismissed(true);
  }, []);

  const handlePlay = () => {
    if (!context || allBlocks.length === 0) return;
    playScript(allBlocks);
  };

  const getExportMeta = () => {
    if (!context) return;

    const isUntitled = isUntitledTitle(context.title);
    
    if (isUntitled) {
      const proceed = window.confirm("You haven't given your masterpiece a title yet. Export as \"Untitled Script\"?");
      if (!proceed) {
        titleInputRef.current?.focus();
        return;
      }
    }
    const trimmedTitle = context.title.trim();
    const displayTitle = isUntitled ? 'Untitled Script' : trimmedTitle;
    const fileStem = isUntitled
      ? 'untitled_script'
      : trimmedTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return { displayTitle, fileStem };
  };

  const handleDownload = () => {
    if (!context) return;
    const exportMeta = getExportMeta();
    if (!exportMeta) return;

    const text = buildScriptTextExport(context.scenes);
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    a.download = `${exportMeta.fileStem}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleExportPdf = () => {
    if (!context) return;
    const exportMeta = getExportMeta();
    if (!exportMeta) return;
    const scriptRoot = document.querySelector(SCRIPT_EXPORT_ROOT_SELECTOR) as HTMLElement | null;
    if (!scriptRoot) {
      window.alert('Unable to locate the script preview for export. Try switching to the script tab and retry.');
      return;
    }
    const opened = openScriptExportWindow(scriptRoot.outerHTML, exportMeta.displayTitle);
    if (!opened) {
      window.alert('Pop-up blocked. Allow pop-ups for this site to export the PDF.');
    }
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
    const currentConfig = voiceConfigs.find((config) =>
      normalizeCharacterName(config.name) === normalizeCharacterName(castingCharacter)
    );
    const config: VoiceConfig = { 
      name: castingCharacter, 
      voiceId, 
      speed: playbackSpeed, 
      pitch: currentConfig?.pitch ?? 0,
      expressive: currentConfig?.expressive ?? false
    };
    await playPreview(text, config);
  };

  const handleOpenCasting = (character: string) => {
    setCastingCharacter(character);
    setVoicesView('casting');
  };

  const handleCloseCasting = () => {
    stop();
    setPreviewVoiceId(null);
    setVoicesView('list');
    setCastingCharacter(null);
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
      ? resolveCharacterName(currentBlock.character || 'Narrator', context?.characters ?? [])
      : 'Narrator'
    : 'None';

  const allBlocks = useMemo(
    () => (context ? context.scenes.flatMap(scene => scene.blocks) : []),
    [context]
  );

  const bufferedBlocks = bufferedCount;
  const totalBufferedBlocks = totalBufferedCount;
  const voiceIds = getVoiceIdList(availableVoices);
  const defaultVoiceId = voiceIds[0] || DEFAULT_NARRATOR_VOICE_ID;

  const voicesContent = context ? (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {voiceCatalogState === 'loading' && (
        <p className="text-[10px] text-gray-500">Loading available voices...</p>
      )}
      {voiceCatalogState === 'error' && (
        <p className="text-[10px] text-amber-300">Voice catalog unavailable. Using fallback voices.</p>
      )}
      {voicesView === 'casting' && castingCharacter ? (
        <VoiceCastingModal
          isOpen={true}
          embedded
          onClose={handleCloseCasting}
          onBack={handleCloseCasting}
          characterName={castingCharacter}
          currentVoiceId={
            voiceConfigs.find((config) => (
              normalizeCharacterName(config.name) === normalizeCharacterName(castingCharacter)
            ))?.voiceId || defaultVoiceId
          }
          availableVoices={availableVoices}
          voiceConfigs={voiceConfigs}
          onSelect={(voiceId) => {
            updateVoiceConfig(castingCharacter, { voiceId });
            handleCloseCasting();
          }}
          onPreview={handleModalPreview}
          isPreviewing={isPreviewPlaying || isLoadingAudio}
          previewVoiceId={previewVoiceId}
        />
      ) : (
        <VoicesPanel
          characters={context.characters}
          availableVoices={availableVoices}
          voiceConfigs={voiceConfigs}
          onUpdateConfig={updateVoiceConfig}
          onOpenCasting={handleOpenCasting}
          onPreview={(config) => playPreview(getPreviewText(config.name), config)}
          onStop={stop}
          isAudioPlaying={isPreviewPlaying}
          isLoading={isLoadingAudio && !isPlaying}
        />
      )}
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to unlock voice casting.</p>
  );
  const playbackContent = context ? (
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
      onRefreshAudio={() => playScript(allBlocks, { forceRegenerate: true })}
      onPurgeAudio={() => {
        clearGeneratedAudio({ clearGlobalCache: true });
        setToast({ message: 'Generated playback audio cleared.' });
      }}
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
  );
  const privacyModal = (
    <PrivacyModal isOpen={isPrivacyOpen} onClose={closePrivacy} />
  );

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden relative">
      <ScriptPane
        context={context}
        titleInputRef={titleInputRef}
        onTitleChange={handleTitleChange}
        suggestedTitle={suggestedTitle}
        isSuggestingTitle={isSuggestingTitle}
        suggestedTitleDismissed={suggestedTitleDismissed}
        onUseSuggestedTitle={handleUseSuggestedTitle}
        onDismissSuggestedTitle={handleDismissSuggestedTitle}
        onClearDraft={handleClearDraft}
        autosaveError={autosaveError}
        error={error}
        userInstruction={userInstruction}
        onInstructionChange={setUserInstruction}
        onGenerateNext={handleGenerateNext}
        onPlotTwist={handleTwist}
        onAddBlock={handleAddBlock}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        insertTarget={insertTarget}
        insertModeActive={insertModeActive}
        pendingInsertBlock={pendingInsertBlock}
        onStartInsertMode={handleStartInsertMode}
        onCancelInsertMode={handleCancelInsertMode}
        onConfirmInsertMode={handleConfirmInsert}
        insertCompleteToken={insertCompleteToken}
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
        onOpenSetup={openManualSetup}
        isSetupOpen={isSetupOpen}
        onCloseSetup={closeSetup}
        setupState={setupState}
        onSetupChange={updateSetupState}
        onStartSetup={handleStart}
        setupAutoSurprise={setupAutoSurprise}
        styleContext={scriptStyleContext}
        onSetupError={handleAiError}
        onExportTxt={handleDownload}
        onExportPdf={handleExportPdf}
        canExport={Boolean(context)}
        playbackContent={playbackContent}
        voicesContent={voicesContent}
        insertScrollTargetId={insertScrollTargetId}
        insertScrollToken={insertScrollToken}
      />

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
