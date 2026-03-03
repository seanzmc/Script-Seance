import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SetupFormState } from './components/SetupForm';
import { stylesLibrary } from './stylesLibrary';
import { ScriptPane } from './components/ScriptPane';
import { openScriptExportWindow, SCRIPT_EXPORT_ROOT_SELECTOR } from './components/ScriptDisplay';
import { VoicesPanel } from './components/VoicesPanel';
import { PromptInspector } from './components/PromptInspector';
import type { PlaybackPanelProps } from './components/PlaybackPanel';
import { VoiceCastingModal } from './components/VoiceCastingModal';
import { LoginModal } from './components/LoginModal';
import { PrivacyModal } from './components/PrivacyModal';
import {
  executeGenerateScene,
  executeSuggestPlotTwist,
  executeRewriteBlock,
  executeGenerateScriptElement,
  executeGenerateSurpriseSetup,
  listVoices,
  PROMPT_DEBUG_EVENT_NAME
} from './services/ai';
import type { PromptDebugTrace } from './services/ai';
import { getSession, login } from './services/auth';
import {
  Scene,
  SceneLengthOption,
  StoryContext,
  VoiceConfig,
  TtsVoice,
  VoiceCatalogState,
  ScriptBlock,
  BlockType,
  GENRES,
  INSERT_TOP_ID,
  INSERT_BOTTOM_ID
} from './types';
import {
  DEFAULT_VOICE_CONFIG,
  resolveDefaultNarratorVoiceId
} from './shared/voiceDefaults.js';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import {
  GenerationOrchestrator,
  scopeKeys,
  doesInsertAnchorResolve,
  captureInsertAnchorSnapshot,
  isRewriteFresh,
  isSetupAutoSurpriseFresh,
  isTitleSuggestionFresh
} from './services/orchestration';
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

type DebugWindow = Window & {
  __SS_DEBUG_PROMPTS__?: boolean;
  __SS_PROMPT_CONTEXT_REVISION__?: number;
  __SS_STYLE_FINGERPRINT__?: string;
};

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
  styleId: null,
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

const getVoiceContextFingerprint = (configs: VoiceConfig[]) => (
  configs
    .map((config) => (
      `${normalizeCharacterName(config.name)}:${config.voiceId}:${config.expressive ? '1' : '0'}`
    ))
    .sort()
    .join('|')
);

const resolveCharacterName = (value: string | null | undefined, characters: string[]) => {
  if (!value) return value ?? undefined;
  const normalized = normalizeCharacterName(value);
  const match = characters.find(char => normalizeCharacterName(char) === normalized);
  return match ?? value;
};

const ensureBlockRevision = (block: ScriptBlock): ScriptBlock => {
  const rawRevision = (block as ScriptBlock & { blockRevision?: number }).blockRevision;
  const blockRevision =
    typeof rawRevision === 'number' && Number.isFinite(rawRevision) && rawRevision > 0
      ? Math.floor(rawRevision)
      : 1;
  return { ...block, blockRevision };
};

const normalizeSceneCharacters = (scene: Scene, characters: string[]) => ({
  ...scene,
  blocks: scene.blocks.map((rawBlock) => {
    const block = ensureBlockRevision(rawBlock);
    return block.character
      ? { ...block, character: resolveCharacterName(block.character, characters) }
      : block;
  })
});

const getVoiceIdList = (voices: TtsVoice[]) => voices.map((voice) => voice.id);

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

const STYLE_BY_ID = new Map(stylesLibrary.map((item) => [item.id, item]));
const STYLE_BY_NORMALIZED_TITLE = new Map(
  stylesLibrary.map((item) => [item.title.trim().toLowerCase(), item])
);

const normalizeStyleId = (value: unknown) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

const normalizeStyleText = (value: unknown) => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

const resolveSetupStyleSelection = (setup: Pick<SetupFormState, 'styleId' | 'style'>) => {
  const explicitStyleId = normalizeStyleId(setup.styleId);
  const explicitStyleText = normalizeStyleText(setup.style);
  const styleFromId = explicitStyleId ? STYLE_BY_ID.get(explicitStyleId) : undefined;
  if (styleFromId) {
    return {
      styleId: styleFromId.id,
      styleName: styleFromId.title,
      legacyStyle: explicitStyleText
    };
  }
  if (!explicitStyleText) {
    return {
      styleId: null,
      styleName: '',
      legacyStyle: ''
    };
  }
  // Backward-compat fallback for title-only persisted setups.
  const fallbackByTitle = STYLE_BY_NORMALIZED_TITLE.get(explicitStyleText.toLowerCase());
  if (fallbackByTitle) {
    return {
      styleId: fallbackByTitle.id,
      styleName: fallbackByTitle.title,
      legacyStyle: explicitStyleText
    };
  }
  return {
    styleId: null,
    styleName: explicitStyleText,
    legacyStyle: explicitStyleText
  };
};

const buildTitleContext = (setup: SetupFormState) => {
  const resolvedStyle = resolveSetupStyleSelection(setup);
  const styleLabel = resolvedStyle.styleName || resolvedStyle.legacyStyle;
  const parts = [
    setup.genre ? `Genre: ${setup.genre}.` : '',
    setup.premise.trim() ? `Premise: ${setup.premise.trim()}` : '',
    setup.characters.length ? `Characters: ${setup.characters.filter(char => char.trim()).join(', ')}.` : '',
    styleLabel ? `Style: ${styleLabel}.` : '',
    setup.length.trim() ? `Length: ${setup.length.trim()}.` : ''
  ].filter(Boolean);
  return parts.join(' ');
};

const buildPromptStyleFingerprint = (value: string) => {
  const source = value.trim();
  if (!source) return 'none';
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  const [promptDebugTraces, setPromptDebugTraces] = useState<PromptDebugTrace[]>([]);
  const [isPromptDebugEnabled, setIsPromptDebugEnabled] = useState(false);
  const orchestratorRef = useRef(new GenerationOrchestrator());
  const scriptIdRef = useRef(crypto.randomUUID());
  const setupSessionIdRef = useRef(crypto.randomUUID());
  const setupManualEditRevisionRef = useRef(0);
  const promptContextRevisionRef = useRef(0);
  const contextRef = useRef<StoryContext | null>(null);
  const userInstructionRef = useRef('');
  const activeGenerationScopeRef = useRef<string | null>(null);
  const manualTitleRevisionRef = useRef(0);
  const voiceContextRevisionRef = useRef(0);
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
  const setupStateRef = useRef<SetupFormState>(DEFAULT_SETUP_STATE);
  const voiceConfigsRef = useRef<VoiceConfig[]>([]);

  // Playback Settings
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Voices tool view state
  const [voicesView, setVoicesView] = useState<'assignments' | 'casting'>('assignments');
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
  const resolvedSetupStyle = useMemo(
    () => resolveSetupStyleSelection({
      style: setupState.style,
      styleId: setupState.styleId ?? null
    }),
    [setupState.style, setupState.styleId]
  );
  const scriptStyleContext = useMemo(() => {
    const genre = context ? context.genre : setupState.genre;
    const style = context
      ? (typeof context.style === 'string' ? context.style.trim() : '')
      : resolvedSetupStyle.styleName;
    const length = context
      ? (typeof context.targetLength === 'string' ? context.targetLength.trim() : '')
      : setupState.length.trim();
    const parts = [
      genre ? `Genre: ${genre}.` : '',
      style ? `Style: ${style}.` : '',
      length ? `Length: ${length}.` : ''
    ].filter(Boolean);
    return parts.join(' ');
  }, [context, resolvedSetupStyle.styleName, setupState.genre, setupState.length]);
  const promptStyleFingerprint = useMemo(() => (
    buildPromptStyleFingerprint(scriptStyleContext)
  ), [scriptStyleContext]);

  const allBlocks = useMemo(
    () => (context ? context.scenes.flatMap(scene => scene.blocks) : []),
    [context]
  );

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    setupStateRef.current = setupState;
  }, [setupState]);

  useEffect(() => {
    voiceConfigsRef.current = voiceConfigs;
  }, [voiceConfigs]);

  useEffect(() => {
    userInstructionRef.current = userInstruction;
  }, [userInstruction]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return;
    const debugWindow = window as DebugWindow;
    setIsPromptDebugEnabled(Boolean(debugWindow.__SS_DEBUG_PROMPTS__));
    debugWindow.__SS_PROMPT_CONTEXT_REVISION__ = promptContextRevisionRef.current;
    debugWindow.__SS_STYLE_FINGERPRINT__ = promptStyleFingerprint;
  }, [context, promptStyleFingerprint, setupState]);

  useEffect(() => {
    if (!isPromptDebugEnabled || typeof window === 'undefined') return;
    const handlePromptDebugTrace = (event: Event) => {
      const detail = (event as CustomEvent<PromptDebugTrace>).detail;
      if (!detail) return;
      setPromptDebugTraces((previous) => [detail, ...previous].slice(0, 30));
    };
    window.addEventListener(PROMPT_DEBUG_EVENT_NAME, handlePromptDebugTrace as EventListener);
    return () => {
      window.removeEventListener(PROMPT_DEBUG_EVENT_NAME, handlePromptDebugTrace as EventListener);
    };
  }, [isPromptDebugEnabled]);

  const applyContextMutation = useCallback((
    mutation: StoryContext | null | ((previous: StoryContext | null) => StoryContext | null),
    options?: { bumpPromptRevision?: boolean }
  ) => {
    const previous = contextRef.current;
    const next = typeof mutation === 'function'
      ? (mutation as (previous: StoryContext | null) => StoryContext | null)(previous)
      : mutation;
    if (next === previous) {
      return false;
    }
    contextRef.current = next;
    if (options?.bumpPromptRevision ?? true) {
      promptContextRevisionRef.current += 1;
    }
    setContext(next);
    return true;
  }, []);

  const applySetupStateMutation = useCallback((
    mutation: SetupFormState | ((previous: SetupFormState) => SetupFormState),
    options?: { source?: 'user' | 'system'; bumpPromptRevision?: boolean }
  ) => {
    const previous = setupStateRef.current;
    const next = typeof mutation === 'function'
      ? (mutation as (previous: SetupFormState) => SetupFormState)(previous)
      : mutation;
    if (next === previous) {
      return false;
    }
    setupStateRef.current = next;
    if (options?.bumpPromptRevision ?? true) {
      promptContextRevisionRef.current += 1;
    }
    if ((options?.source ?? 'user') === 'user') {
      setupManualEditRevisionRef.current += 1;
    }
    setSetupState(next);
    return true;
  }, []);

  const applyVoiceConfigMutation = useCallback((
    mutation: VoiceConfig[] | ((previous: VoiceConfig[]) => VoiceConfig[])
  ) => {
    const previous = voiceConfigsRef.current;
    const next = typeof mutation === 'function'
      ? (mutation as (previous: VoiceConfig[]) => VoiceConfig[])(previous)
      : mutation;
    if (next === previous) {
      return false;
    }
    voiceConfigsRef.current = next;
    const previousFingerprint = getVoiceContextFingerprint(previous);
    const nextFingerprint = getVoiceContextFingerprint(next);
    if (previousFingerprint !== nextFingerprint) {
      voiceContextRevisionRef.current += 1;
    }
    setVoiceConfigs(next);
    return true;
  }, []);

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
    setupSessionIdRef.current = crypto.randomUUID();
    setupManualEditRevisionRef.current = 0;
    setIsSetupOpen(true);
  };

  const closeSetup = () => {
    setIsSetupOpen(false);
    setSetupAutoSurprise(false);
  };

  const updateSetupState = useCallback((next: Partial<SetupFormState>, meta?: { source?: 'user' | 'system' }) => {
    const source = meta?.source ?? 'user';
    const hasStyleSelection =
      Object.prototype.hasOwnProperty.call(next, 'style') ||
      Object.prototype.hasOwnProperty.call(next, 'styleId');
    if (hasStyleSelection && contextRef.current) {
      const baseState = setupStateRef.current;
      const requestedStyle = Object.prototype.hasOwnProperty.call(next, 'style')
        ? next.style
        : baseState.style;
      const requestedStyleId = Object.prototype.hasOwnProperty.call(next, 'styleId')
        ? next.styleId
        : (baseState.styleId ?? null);
      const resolved = resolveSetupStyleSelection({
        ...baseState,
        style: typeof requestedStyle === 'string' ? requestedStyle : '',
        styleId: typeof requestedStyleId === 'string' ? requestedStyleId : null
      });
      const normalizedStyle = resolved.styleName ? resolved.styleName : undefined;
      const didMutateContext = applyContextMutation((prev) => {
        if (!prev) return prev;
        if (prev.style === normalizedStyle) {
          return prev;
        }
        return { ...prev, style: normalizedStyle };
      });
      applySetupStateMutation((prev) => ({
        ...prev,
        ...next,
        styleId: resolved.styleId,
        style: resolved.styleName
      }), {
        source,
        bumpPromptRevision: !didMutateContext
      });
      return;
    }
    applySetupStateMutation((prev) => ({ ...prev, ...next }), { source });
  }, [applyContextMutation, applySetupStateMutation]);
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

  const cancelAiRequest = useCallback(() => {
    const scopeKey = activeGenerationScopeRef.current;
    if (scopeKey) {
      orchestratorRef.current.cancelScope(scopeKey);
    }
    activeGenerationScopeRef.current = null;
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
  } = useAudioPlayer(voiceConfigs, handleAiError, handleAudioSkip, {
    scriptId: scriptIdRef.current,
    voiceContextRevision: voiceContextRevisionRef.current,
    blocks: allBlocks
  });

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
    const narratorVoiceId = resolveDefaultNarratorVoiceId(availableVoices);

    applyVoiceConfigMutation((prev) => {
      const next = [...prev];
      const hasVoiceConfig = (name: string) =>
        next.some(config => normalizeCharacterName(config.name) === normalizeCharacterName(name));

      if (!hasVoiceConfig('Narrator')) {
        next.push({
          name: 'Narrator',
          voiceId: narratorVoiceId,
          ...DEFAULT_VOICE_CONFIG
        });
      }

      context.characters.forEach((char, idx) => {
        if (!hasVoiceConfig(char)) {
          const hasVoiceOptions = voiceIds.length > 0;
          const voice = hasVoiceOptions ? voiceIds[idx % voiceIds.length] : narratorVoiceId;
          next.push({ name: char, voiceId: voice, ...DEFAULT_VOICE_CONFIG });
        }
      });

      return next;
    });
  }, [applyVoiceConfigMutation, availableVoices, context?.characters, playbackSpeed]);

  useEffect(() => {
    if (context) {
      applySetupStateMutation((prev) => ({
        ...prev,
        genre: context.genre,
        premise: context.premise,
        characters: context.characters,
        styleId: resolveSetupStyleSelection({
          styleId: null,
          style: typeof context.style === 'string' ? context.style : ''
        }).styleId,
        style: typeof context.style === 'string' ? context.style : '',
        length: normalizeTargetLength(context.targetLength)
      }), {
        source: 'system',
        bumpPromptRevision: false
      });
    }
  }, [applySetupStateMutation, context]);

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
        applyContextMutation(hydratedContext);
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
  }, [applyContextMutation]);

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
      setVoicesView('assignments');
      setCastingCharacter(null);
      return;
    }
    if (!castingCharacter) {
      setVoicesView('assignments');
      return;
    }
    const isKnownCharacter = normalizeCharacterName(castingCharacter) === normalizeCharacterName('Narrator')
      || context.characters.some((character) => (
        normalizeCharacterName(character) === normalizeCharacterName(castingCharacter)
      ));
    if (!isKnownCharacter) {
      setVoicesView('assignments');
      setCastingCharacter(null);
    }
  }, [castingCharacter, context]);

  useEffect(() => {
    if (!context || !suggestedTitle || suggestedTitleDismissed) return;
    if (hasManualTitleRef.current) return;
    if (!isUntitledTitle(context.title)) return;
    applyContextMutation((prev) => prev ? { ...prev, title: suggestedTitle } : prev);
  }, [applyContextMutation, context, suggestedTitle, suggestedTitleDismissed]);

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
    applyContextMutation(null);
    setUserInstruction('');
    applyVoiceConfigMutation([]);
    applySetupStateMutation(DEFAULT_SETUP_STATE, { source: 'system' });
    setupSessionIdRef.current = crypto.randomUUID();
    setupManualEditRevisionRef.current = 0;
    scriptIdRef.current = crypto.randomUUID();
    manualTitleRevisionRef.current = 0;
    activeGenerationScopeRef.current = null;
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
      const startedPromptContextRevision = promptContextRevisionRef.current;
      const startedManualTitleRevision = manualTitleRevisionRef.current;
      const contextText = buildTitleContext(setup);
      const instruction = [
        'Create a concise, evocative screenplay title (2-6 words).',
        'Return only the title text, no quotes.',
        'Avoid scene headings like INT./EXT.'
      ].join(' ');
      const scopeKey = scopeKeys.titleSuggestion(scriptIdRef.current);
      const outcome = await orchestratorRef.current.run<string>({
        opType: 'titleSuggestion',
        scopeKey,
        execute: (signal) => executeGenerateScriptElement(
          BlockType.ACTION,
          undefined,
          instruction,
          contextText,
          { signal, opType: 'titleSuggestion', scopeKey }
        ),
        isFresh: () => isTitleSuggestionFresh({
          startedPromptContextRevision,
          currentPromptContextRevision: promptContextRevisionRef.current,
          startedManualTitleRevision,
          currentManualTitleRevision: manualTitleRevisionRef.current
        }),
        commit: (rawTitle) => {
          const cleanedTitle = sanitizeSuggestedTitle(rawTitle);
          const finalTitle = cleanedTitle || buildFallbackTitle(setup.premise, setup.genre);
          if (!finalTitle || finalTitle === DEFAULT_TITLE) return;
          setSuggestedTitle(finalTitle);
          setSuggestedTitleDismissed(false);
          if (!hasManualTitleRef.current) {
            applyContextMutation((prev) => {
              if (!prev || !isUntitledTitle(prev.title)) return prev;
              return { ...prev, title: finalTitle };
            });
          }
        }
      });
      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, 'Failed to suggest title.');
      }
    } catch (err) {
      handleAiError(err, 'Failed to suggest title.');
    } finally {
      if (titleSuggestionTokenRef.current === token) {
        setIsSuggestingTitle(false);
      }
    }
  }, [applyContextMutation, handleAiError]);

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
    try {
      closeSetup();
      resetUndoRedo();
      resetTitleSuggestionState();
      scriptIdRef.current = crypto.randomUUID();
      manualTitleRevisionRef.current = 0;
      void requestTitleSuggestion(setupState);
      const instruction = 'Write the opening scene setting the tone.';
      const initialContext: StoryContext = { 
        genre: setupState.genre,
        premise: setupState.premise,
        characters: normalizedCharacters,
        title: DEFAULT_TITLE,
        scenes: [],
        style: resolvedSetupStyle.styleName || undefined,
        targetLength: normalizeTargetLength(setupState.length)
      };
      const startedPromptContextRevision = promptContextRevisionRef.current;
      const scopeKey = scopeKeys.generateOpeningScene(scriptIdRef.current);
      activeGenerationScopeRef.current = scopeKey;
      setIsGenerating(true);
      setError(null);

      const outcome = await orchestratorRef.current.run<Scene>({
        opType: 'generateOpeningScene',
        scopeKey,
        execute: (signal) => executeGenerateScene(
          initialContext,
          instruction,
          true,
          { signal, opType: 'generateOpeningScene', scopeKey }
        ),
        isFresh: () =>
          promptContextRevisionRef.current === startedPromptContextRevision &&
          !contextRef.current,
        commit: (firstScene) => {
          const normalizedFirstScene = normalizeSceneCharacters(firstScene, initialContext.characters);
          const initialLastBlockId = normalizedFirstScene.blocks[normalizedFirstScene.blocks.length - 1]?.id;
          applyContextMutation({
            ...initialContext,
            scenes: [normalizedFirstScene]
          });
          setInsertScrollTargetId(initialLastBlockId ?? 'bottom');
          setInsertScrollToken(token => token + 1);
        }
      });

      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, "Failed to generate story");
      }
    } catch (err: unknown) {
      handleAiError(err, "Failed to generate story");
    } finally {
      if (activeGenerationScopeRef.current === scopeKeys.generateOpeningScene(scriptIdRef.current)) {
        activeGenerationScopeRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleGenerateNext = async () => {
    if (!context || isGenerating) return;
    try {
      clearRedo();
      const prompt = userInstruction || "Continue the story logically.";
      const startedPromptContextRevision = promptContextRevisionRef.current;
      const scopeKey = scopeKeys.generateNextScene(scriptIdRef.current);
      activeGenerationScopeRef.current = scopeKey;
      setIsGenerating(true);
      setError(null);

      const outcome = await orchestratorRef.current.run<Scene>({
        opType: 'generateNextScene',
        scopeKey,
        execute: (signal) => executeGenerateScene(
          context,
          prompt,
          false,
          { signal, opType: 'generateNextScene', scopeKey }
        ),
        isFresh: () => promptContextRevisionRef.current === startedPromptContextRevision,
        commit: (nextScene) => {
          const normalizedScene = normalizeSceneCharacters(nextScene, context.characters);
          const lastBlockId = normalizedScene.blocks[normalizedScene.blocks.length - 1]?.id;
          applyContextMutation((prev) => {
            if (!prev) return null;
            const updatedScenes = [...prev.scenes, normalizedScene];
            return { ...prev, scenes: updatedScenes };
          });
          setInsertScrollTargetId(lastBlockId ?? 'bottom');
          setInsertScrollToken(token => token + 1);
          setUserInstruction('');
        }
      });
      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, 'Failed to generate scene.');
      }
    } catch (err: unknown) {
      handleAiError(err, 'Failed to generate scene.');
    } finally {
      if (activeGenerationScopeRef.current === scopeKeys.generateNextScene(scriptIdRef.current)) {
        activeGenerationScopeRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleTwist = async () => {
    if (!context || isGenerating) return;
    try {
      const startedPromptContextRevision = promptContextRevisionRef.current;
      const startedUserInstruction = userInstructionRef.current;
      const scopeKey = scopeKeys.suggestPlotTwist(scriptIdRef.current);
      activeGenerationScopeRef.current = scopeKey;
      setIsGenerating(true);
      setError(null);

      const outcome = await orchestratorRef.current.run<string>({
        opType: 'suggestPlotTwist',
        scopeKey,
        execute: (signal) => executeSuggestPlotTwist(
          context.genre,
          context.style,
          { signal, opType: 'suggestPlotTwist', scopeKey }
        ),
        isFresh: () =>
          promptContextRevisionRef.current === startedPromptContextRevision &&
          userInstructionRef.current === startedUserInstruction,
        commit: (twist) => {
          setUserInstruction(`PLOT TWIST: ${twist}`);
        }
      });
      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, 'Failed to generate plot twist.');
      }
    } catch (err: unknown) {
      handleAiError(err, 'Failed to generate plot twist.');
    } finally {
      if (activeGenerationScopeRef.current === scopeKeys.suggestPlotTwist(scriptIdRef.current)) {
        activeGenerationScopeRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleAddBlock = (block: ScriptBlock) => {
    if (!context) return;
    clearRedo();
    setInsertScrollTargetId(block.id);
    setInsertScrollToken(token => token + 1);
    
    applyContextMutation((prev) => {
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
    applyContextMutation((prev) => {
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
  }, [applyContextMutation, clearRedo, pushUndoAction]);

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
    applyContextMutation((prev) => {
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
    applyContextMutation((prev) => {
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
    applyContextMutation((prev) => {
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
  }, [applyContextMutation, clearRedo]);

  const handleChangeSpeaker = useCallback((sceneId: string, blockId: string, character: string) => {
    clearRedo();
    applyContextMutation((prev) => {
      if (!prev) return null;
      const resolvedCharacter = resolveCharacterName(character, prev.characters);
      return {
        ...prev,
        scenes: prev.scenes.map(scene => scene.id === sceneId ? {
          ...scene,
          blocks: scene.blocks.map((block) => {
            if (block.id !== blockId) {
              return block;
            }
            if (block.character === resolvedCharacter) {
              return block;
            }
            return { ...block, character: resolvedCharacter, blockRevision: block.blockRevision + 1 };
          })
        } : scene)
      };
    });
  }, [applyContextMutation, clearRedo]);

  const handleInsertSurprise = useCallback(async (params: {
    elementType: BlockType;
    selectedChar: string;
    instruction: string;
    promptContext: string;
    onCommit: (generatedText: string) => void;
  }) => {
    const startedPromptContextRevision = promptContextRevisionRef.current;
    const anchorSnapshot = captureInsertAnchorSnapshot(contextRef.current, insertTarget);
    const scopeKey = scopeKeys.insertSurpriseText(scriptIdRef.current, anchorSnapshot.anchorIdOrIndex);

    const outcome = await orchestratorRef.current.run<string>({
      opType: 'insertSurpriseText',
      scopeKey,
      execute: (signal) => executeGenerateScriptElement(
        params.elementType,
        params.selectedChar,
        params.instruction,
        params.promptContext,
        { signal, opType: 'insertSurpriseText', scopeKey }
      ),
      isFresh: () =>
        promptContextRevisionRef.current === startedPromptContextRevision &&
        doesInsertAnchorResolve(anchorSnapshot, contextRef.current),
      commit: (generatedText) => {
        params.onCommit(generatedText);
      }
    });

    if (outcome.kind === 'failed') {
      handleAiError(outcome.error, 'Failed to generate block.');
    }
  }, [handleAiError, insertTarget]);

  const handleSetupSurprise = useCallback(async (params: {
    mode: 'manual' | 'auto';
    targetGenre: string;
  }) => {
    const startedSetupSessionId = setupSessionIdRef.current;
    const startedSetupManualEditRevision = setupManualEditRevisionRef.current;
    const opType = params.mode === 'auto' ? 'setupAutoSurprise' : 'setupSurprise';
    const scopeKey = params.mode === 'auto'
      ? scopeKeys.setupAutoSurprise(startedSetupSessionId)
      : scopeKeys.setupSurprise(startedSetupSessionId);

    const resolvedStyleSelection = resolveSetupStyleSelection(setupStateRef.current);
    const surpriseSetupContext = {
      targetGenre: params.targetGenre,
      ...(resolvedStyleSelection.styleId
        ? {
            styleId: resolvedStyleSelection.styleId,
            styleName: resolvedStyleSelection.styleName
          }
        : {}),
      ...(!resolvedStyleSelection.styleId && resolvedStyleSelection.legacyStyle
        ? { style: resolvedStyleSelection.legacyStyle }
        : {})
    };

    const outcome = await orchestratorRef.current.run<{ genre: string; premise: string; characters: string[] }>({
      opType,
      scopeKey,
      trigger: params.mode === 'auto' ? 'system' : 'user',
      execute: (signal) => executeGenerateSurpriseSetup(
        surpriseSetupContext,
        { signal, opType, scopeKey }
      ),
      isFresh: () => {
        if (params.mode === 'auto') {
          return isSetupAutoSurpriseFresh({
            startedSetupSessionId,
            currentSetupSessionId: setupSessionIdRef.current,
            startedSetupManualEditRevision,
            currentSetupManualEditRevision: setupManualEditRevisionRef.current
          });
        }
        return setupSessionIdRef.current === startedSetupSessionId;
      },
      commit: (data) => {
        updateSetupState({
          genre: data.genre,
          premise: data.premise,
          characters: data.characters
        }, { source: 'system' });
      }
    });

    if (outcome.kind === 'failed') {
      handleAiError(outcome.error, 'Failed to generate a surprise setup.');
      return false;
    }
    return outcome.kind === 'committed';
  }, [handleAiError, updateSetupState]);

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
    const startedBlockRevision = block.blockRevision;
    const startedPromptContextRevision = promptContextRevisionRef.current;
    const scopeKey = scopeKeys.rewriteBlock(scriptIdRef.current, blockId);
    try {
      activeGenerationScopeRef.current = scopeKey;
      setIsGenerating(true);
      setError(null);

      const outcome = await orchestratorRef.current.run<string>({
        opType: 'rewriteBlock',
        scopeKey,
        execute: (signal) => executeRewriteBlock(
          block,
          context.genre,
          context.premise,
          context.style,
          rewriteGuidance,
          { signal, opType: 'rewriteBlock', scopeKey }
        ),
        isFresh: () => isRewriteFresh({
          context: contextRef.current,
          sceneId,
          blockId,
          startedBlockRevision,
          startedPromptContextRevision,
          currentPromptContextRevision: promptContextRevisionRef.current
        }),
        commit: (newText) => {
          clearRedo();
          applyContextMutation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              scenes: prev.scenes.map(s => s.id === sceneId ? {
                ...s,
                blocks: s.blocks.map((b) => (
                  b.id === blockId
                    ? { ...b, text: newText, blockRevision: b.blockRevision + 1 }
                    : b
                ))
              } : s)
            };
          });
          setInsertScrollTargetId(blockId);
          setInsertScrollToken(token => token + 1);
          setToast({
            message: 'Block regenerated',
            onUndo: () => {
              applyContextMutation((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  scenes: prev.scenes.map(s => s.id === sceneId ? {
                    ...s,
                    blocks: s.blocks.map((b) => (
                      b.id === blockId
                        ? { ...b, text: originalText, blockRevision: b.blockRevision + 1 }
                        : b
                    ))
                  } : s)
                };
              });
              setToast(null);
            }
          });
        }
      });
      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, 'Failed to regenerate block.');
      }
    } catch (err: unknown) {
      handleAiError(err, 'Failed to regenerate block.');
    } finally {
      if (activeGenerationScopeRef.current === scopeKey) {
        activeGenerationScopeRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [applyContextMutation, clearRedo, context, handleAiError, isGenerating]);

  const handleDeleteBlock = useCallback((sceneId: string, blockId: string) => {
    let deletedBlock: ScriptBlock | null = null;
    let deletedIndex = -1;

    clearRedo();
    const didMutate = applyContextMutation((prev) => {
      if (!prev) return prev;
      const sceneIndex = prev.scenes.findIndex((scene) => scene.id === sceneId);
      if (sceneIndex === -1) return prev;

      const scene = prev.scenes[sceneIndex];
      const blockIndex = scene.blocks.findIndex((block) => block.id === blockId);
      if (blockIndex === -1) return prev;

      deletedBlock = scene.blocks[blockIndex];
      deletedIndex = blockIndex;

      const nextBlocks = [...scene.blocks];
      nextBlocks.splice(blockIndex, 1);
      const nextScenes = [...prev.scenes];
      nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
      return { ...prev, scenes: nextScenes };
    });

    if (!didMutate || !deletedBlock || deletedIndex < 0) {
      return;
    }
    const restoredBlock = deletedBlock;
    const restoredIndex = deletedIndex;

    setToast({
      message: 'Block deleted',
      onUndo: () => {
        clearRedo();
        applyContextMutation((prev) => {
          if (!prev) return prev;
          const sceneIndex = prev.scenes.findIndex((scene) => scene.id === sceneId);
          if (sceneIndex === -1) return prev;

          const scene = prev.scenes[sceneIndex];
          if (scene.blocks.some((block) => block.id === restoredBlock.id)) {
            return prev;
          }

          const nextBlocks = [...scene.blocks];
          const insertIndex = Math.min(restoredIndex, nextBlocks.length);
          nextBlocks.splice(insertIndex, 0, restoredBlock);
          const nextScenes = [...prev.scenes];
          nextScenes[sceneIndex] = { ...scene, blocks: nextBlocks };
          return { ...prev, scenes: nextScenes };
        });
        setInsertScrollTargetId(restoredBlock.id);
        setInsertScrollToken((token) => token + 1);
        setToast(null);
      }
    });
  }, [applyContextMutation, clearRedo]);

  const updateVoiceConfig = (char: string, updates: Partial<VoiceConfig>) => {
    const voiceIds = getVoiceIdList(availableVoices);
    const defaultVoiceId = voiceIds[0] || resolveDefaultNarratorVoiceId(availableVoices);
    let shouldClearGeneratedAudio = false;
    applyVoiceConfigMutation((prev) => {
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
        ...DEFAULT_VOICE_CONFIG,
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
    applyVoiceConfigMutation((prev) => prev.map(config => ({ ...config, speed })));
  };

  const applyTitle = useCallback((newTitle: string, source: 'auto' | 'user') => {
    applyContextMutation((prev) => prev ? { ...prev, title: newTitle } : null);
    if (source === 'user') {
      manualTitleRevisionRef.current += 1;
      hasManualTitleRef.current = true;
    }
  }, [applyContextMutation]);

  const handleTitleChange = (newTitle: string) => {
    applyTitle(newTitle, 'user');
  };

  const handleSaveStyle = useCallback((nextStyle: string) => {
    const normalizedStyle = nextStyle.trim() ? nextStyle.trim() : undefined;
    const didMutateContext = applyContextMutation((prev) => {
      if (!prev) return prev;
      if (prev.style === normalizedStyle) {
        return prev;
      }
      return { ...prev, style: normalizedStyle };
    });
    if (!didMutateContext) {
      return;
    }
    applySetupStateMutation((prev) => ({ ...prev, styleId: null, style: normalizedStyle ?? '' }), {
      source: 'system',
      bumpPromptRevision: false
    });
  }, [applyContextMutation, applySetupStateMutation]);

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
    await playPreview(text, config, { scopeId: castingCharacter });
  };

  const handleOpenCasting = (character: string) => {
    setCastingCharacter(character);
    setVoicesView('casting');
  };

  const handleCloseCasting = () => {
    stop();
    setPreviewVoiceId(null);
    setVoicesView('assignments');
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

  const bufferedBlocks = bufferedCount;
  const totalBufferedBlocks = totalBufferedCount;
  const voiceIds = getVoiceIdList(availableVoices);
  const defaultVoiceId = voiceIds[0] || resolveDefaultNarratorVoiceId(availableVoices);
  const isTtsPreviewEnabled = voiceCatalogState === 'ready' && availableVoices.length > 0;

  const voicesContent = context ? (
    // ToolPanelShell owns scrolling; keep tool roots overflow-free unless absolutely required.
    <div className="flex flex-col gap-2">
      {voiceCatalogState === 'loading' && (
        <p className="text-[10px] text-gray-500">Loading available voices...</p>
      )}
      {voiceCatalogState === 'error' && (
        <p className="text-[10px] text-amber-300">Voice catalog unavailable. No provider voices loaded.</p>
      )}
      {voiceCatalogState === 'ready' && !isTtsPreviewEnabled && (
        <p className="text-[10px] text-amber-300">TTS provider not configured. Preview is disabled.</p>
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
          isPreviewEnabled={isTtsPreviewEnabled}
        />
      ) : (
        <VoicesPanel
          characters={context.characters}
          availableVoices={availableVoices}
          voiceConfigs={voiceConfigs}
          onUpdateConfig={updateVoiceConfig}
          onOpenCasting={handleOpenCasting}
          onPreview={(config) => playPreview(getPreviewText(config.name), config, { scopeId: config.name })}
          onStop={stop}
          isAudioPlaying={isPreviewPlaying}
          isLoading={isLoadingAudio && !isPlaying}
          isPreviewEnabled={isTtsPreviewEnabled}
        />
      )}
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to unlock voice casting.</p>
  );
  const playbackProps: PlaybackPanelProps = {
    isPlaying,
    isPaused,
    isLoadingAudio,
    currentBlockId,
    currentBlockIndex,
    blockStatuses,
    onPlay: handlePlay,
    onPause: pause,
    onResume: resume,
    onStop: stop,
    onPrev: goToPrevious,
    onNext: goToNext,
    onRetry: retryCurrentBlock,
    onSkip: skipCurrentBlock,
    onRefreshAudio: () => playScript(allBlocks, { forceRegenerate: true }),
    onPurgeAudio: () => {
      clearGeneratedAudio({ clearGlobalCache: true });
      setToast({ message: 'Generated playback audio cleared.' });
    },
    bufferedCount: bufferedBlocks,
    totalCount: totalBufferedBlocks,
    currentSpeaker,
    playbackSpeed,
    onPlaybackSpeedChange: handleGlobalSpeedChange,
    showHighlights,
    onToggleHighlights: () => setShowHighlights(!showHighlights),
    autoScroll,
    onToggleAutoScroll: () => setAutoScroll(!autoScroll)
  };
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
        onInsertSurprise={handleInsertSurprise}
        onInsertError={(err) => handleAiError(err, 'Failed to generate block.')}
        onRegenerate={handleRegenerateBlock}
        onDeleteBlock={handleDeleteBlock}
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
        onSaveStyle={handleSaveStyle}
        isSetupOpen={isSetupOpen}
        onCloseSetup={closeSetup}
        setupState={setupState}
        onSetupChange={updateSetupState}
        onSetupSurprise={handleSetupSurprise}
        onStartSetup={handleStart}
        setupAutoSurprise={setupAutoSurprise}
        styleContext={scriptStyleContext}
        onSetupError={handleAiError}
        onExportTxt={handleDownload}
        onExportPdf={handleExportPdf}
        canExport={Boolean(context)}
        playbackProps={context ? playbackProps : undefined}
        voicesContent={voicesContent}
        insertScrollTargetId={insertScrollTargetId}
        insertScrollToken={insertScrollToken}
      />

      {isPromptDebugEnabled && (
        <PromptInspector
          traces={promptDebugTraces}
          onClear={() => setPromptDebugTraces([])}
        />
      )}

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
