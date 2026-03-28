import { useState, useEffect, useRef, useCallback, useMemo, type RefObject, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { SetupFormState, type VoicePreference, synchronizeSetupVoicePreferences, DEFAULT_CHARACTER_VOICE_PREFERENCE, DEFAULT_NARRATOR_VOICE_PREFERENCE } from '../components/SetupForm';
import type { PlaybackPanelProps } from '../components/PlaybackPanel';
import { VoiceCastingModal } from '../components/VoiceCastingModal';
import { VoicesPanel } from '../components/VoicesPanel';
import { executeGenerateScene, executeSuggestPlotTwist, executeGenerateScriptElement, executeGenerateSurpriseSetup } from '../services/ai';
import { Scene, StoryContext, VoiceConfig, ScriptBlock, ScriptAnchor, BlockType, GENRES, RevealScrollMode } from '../types';
import { DEFAULT_VOICE_CONFIG, sanitizeVoiceIdForUsage } from '../shared/voiceDefaults.js';
import { fadeSlideYVariants } from '../components/motion/primitives';
import { useAudioPlayer } from './useAudioPlayer';
import { useAuthSession } from './useAuthSession';
import { useDraftPersistence } from './useDraftPersistence';
import { usePrivacyRoute } from './usePrivacyRoute';
import { usePromptDebug } from './usePromptDebug';
import { useVoiceCatalog } from './useVoiceCatalog';
import { GenerationOrchestrator, scopeKeys, isSetupAutoSurpriseFresh, isTitleSuggestionFresh } from '../services/orchestration';
import { createScriptMutationController, type ScriptMutationAction } from '../services/scriptController';
import { buildFallbackTitle, buildPromptStyleFingerprint, buildTitleContext, resolveSetupStyleSelection, sanitizeSuggestedTitle } from '../services/setupStyle';
import { buildScriptTextExport } from '../services/scriptExport';
import { normalizeCharacterName, normalizeSceneCharacters, normalizeTargetLength, resolveCharacterName } from '../services/storyContext';
import { openScriptExportWindow, SCRIPT_EXPORT_ROOT_SELECTOR } from '../components/ScriptDisplay';

interface ToastState {
  message: string;
  onUndo?: () => void;
}

interface UseStoryWorkspaceParams {
  titleInputRef: RefObject<HTMLInputElement | null>;
}

const DRAFT_DEBOUNCE_MS = 800;
const DEFAULT_TITLE = 'Untitled Screenplay';
const DEFAULT_SETUP_STATE: SetupFormState = {
  genre: GENRES[0],
  premise: '',
  characters: ['Hero', 'Villain'],
  characterVoicePreferences: [
    DEFAULT_CHARACTER_VOICE_PREFERENCE,
    DEFAULT_CHARACTER_VOICE_PREFERENCE
  ],
  narratorVoicePreference: DEFAULT_NARRATOR_VOICE_PREFERENCE,
  styleId: null,
  style: '',
  length: 'Medium'
};

const normalizeSetupState = (value: SetupFormState): SetupFormState => ({
  ...value,
  ...synchronizeSetupVoicePreferences(value)
});

const buildCharacterPreferenceLookup = (setup: SetupFormState) => {
  const lookup = new Map<string, VoicePreference>();
  const preferences = synchronizeSetupVoicePreferences(setup).characterVoicePreferences;
  setup.characters.forEach((character, index) => {
    const normalized = normalizeCharacterName(character);
    if (normalized) {
      lookup.set(normalized, preferences[index] ?? DEFAULT_CHARACTER_VOICE_PREFERENCE);
    }
  });
  return lookup;
};

const getVoicePreferenceForCharacter = (
  characterName: string,
  lookup: Map<string, VoicePreference>
) => lookup.get(normalizeCharacterName(characterName)) ?? DEFAULT_CHARACTER_VOICE_PREFERENCE;

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

const getVoiceContextFingerprint = (configs: VoiceConfig[]) => (
  configs
    .map((config) => (
      `${normalizeCharacterName(config.name)}:${config.voiceId}:${config.expressive ? '1' : '0'}`
    ))
    .sort()
    .join('|')
);

export function useStoryWorkspace({ titleInputRef }: UseStoryWorkspaceParams) {
  const [context, setContext] = useState<StoryContext | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceConfigs, setVoiceConfigs] = useState<VoiceConfig[]>([]);
  const [userInstruction, setUserInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [suggestedTitleDismissed, setSuggestedTitleDismissed] = useState(false);
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
  const [insertCompleteToken, setInsertCompleteToken] = useState(0);
  const [revealScrollToken, setRevealScrollToken] = useState(0);
  const [revealScrollTargetId, setRevealScrollTargetId] = useState<string | null>(null);
  const [revealScrollMode, setRevealScrollMode] = useState<RevealScrollMode>('default');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupAutoSurprise, setSetupAutoSurprise] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const undoStackRef = useRef<ScriptMutationAction[]>([]);
  const redoStackRef = useRef<ScriptMutationAction[]>([]);
  const setupStateRef = useRef<SetupFormState>(DEFAULT_SETUP_STATE);
  const voiceConfigsRef = useRef<VoiceConfig[]>([]);

  const [showHighlights, setShowHighlights] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [voicesView, setVoicesView] = useState<'assignments' | 'casting'>('assignments');
  const [castingCharacter, setCastingCharacter] = useState<string | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

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
    const resolvedStyle = context
      ? resolveSetupStyleSelection({
          style: typeof context.style === 'string' ? context.style : '',
          styleId: context.styleId ?? null
        })
      : resolvedSetupStyle;
    const style = resolvedStyle.styleName || resolvedStyle.legacyStyle;
    const length = context
      ? (typeof context.targetLength === 'string' ? context.targetLength.trim() : '')
      : setupState.length.trim();
    const parts = [
      genre ? `Genre: ${genre}.` : '',
      style ? `Style: ${style}.` : '',
      resolvedStyle.styleId ? `Style ID: ${resolvedStyle.styleId}.` : '',
      length ? `Length: ${length}.` : ''
    ].filter(Boolean);
    return parts.join(' ');
  }, [context, resolvedSetupStyle, setupState.genre, setupState.length]);
  const promptStyleFingerprint = useMemo(
    () => buildPromptStyleFingerprint(scriptStyleContext),
    [scriptStyleContext]
  );
  const characterVoicePreferenceLookup = useMemo(
    () => buildCharacterPreferenceLookup(setupState),
    [setupState]
  );
  const narratorVoicePreference = useMemo(
    () => normalizeSetupState(setupState).narratorVoicePreference ?? DEFAULT_NARRATOR_VOICE_PREFERENCE,
    [setupState]
  );
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

  const {
    authStatus,
    authError,
    isAuthLoading,
    handleLogin,
    requireAuthentication
  } = useAuthSession();
  const { availableVoices, voiceCatalogState } = useVoiceCatalog(authStatus);
  const { isPrivacyOpen, openPrivacy, closePrivacy } = usePrivacyRoute();
  const {
    isPromptDebugEnabled,
    promptDebugTraces,
    clearPromptDebugTraces
  } = usePromptDebug({
    promptContextRevision: promptContextRevisionRef.current,
    promptStyleFingerprint
  });

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

  const {
    autosaveError,
    clearAutosaveError,
    clearPersistedDraft
  } = useDraftPersistence({
    context,
    userInstruction,
    debounceMs: DRAFT_DEBOUNCE_MS,
    onHydrate: useCallback((storedDraft) => {
      const hydratedContext: StoryContext = {
        ...storedDraft.context,
        scenes: storedDraft.context.scenes.map((scene) => (
          normalizeSceneCharacters(scene, storedDraft.context.characters)
        ))
      };
      applyContextMutation(hydratedContext);
      if (typeof storedDraft.userInstruction === 'string') {
        setUserInstruction(storedDraft.userInstruction);
      }
    }, [applyContextMutation])
  });

  const applySetupStateMutation = useCallback((
    mutation: SetupFormState | ((previous: SetupFormState) => SetupFormState),
    options?: { source?: 'user' | 'system'; bumpPromptRevision?: boolean }
  ) => {
    const previous = setupStateRef.current;
    const rawNext = typeof mutation === 'function'
      ? (mutation as (previous: SetupFormState) => SetupFormState)(previous)
      : mutation;
    const next = normalizeSetupState(rawNext);
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
  const pushUndoAction = useCallback((action: ScriptMutationAction) => {
    undoStackRef.current.push(action);
    setUndoCount(undoStackRef.current.length);
  }, []);
  const popUndoAction = useCallback(() => {
    const action = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    return action;
  }, []);
  const pushRedoAction = useCallback((action: ScriptMutationAction) => {
    redoStackRef.current.push(action);
    setRedoCount(redoStackRef.current.length);
  }, []);
  const popRedoAction = useCallback(() => {
    const action = redoStackRef.current.pop();
    setRedoCount(redoStackRef.current.length);
    return action;
  }, []);

  const openManualSetup = useCallback(() => {
    setSetupAutoSurprise(false);
    setupSessionIdRef.current = crypto.randomUUID();
    setupManualEditRevisionRef.current = 0;
    setIsSetupOpen(true);
  }, []);

  const closeSetup = useCallback(() => {
    setIsSetupOpen(false);
    setSetupAutoSurprise(false);
  }, []);

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
      const normalizedStyle = resolved.styleName || resolved.legacyStyle || undefined;
      const normalizedStyleId = resolved.styleId ?? undefined;
      const didMutateContext = applyContextMutation((prev) => {
        if (!prev) return prev;
        if (prev.style === normalizedStyle && (prev.styleId ?? undefined) === normalizedStyleId) {
          return prev;
        }
        return { ...prev, style: normalizedStyle, styleId: normalizedStyleId };
      });
      applySetupStateMutation((prev) => ({
        ...prev,
        ...next,
        styleId: resolved.styleId,
        style: resolved.styleName || resolved.legacyStyle
      }), {
        source,
        bumpPromptRevision: !didMutateContext
      });
      return;
    }
    applySetupStateMutation((prev) => ({ ...prev, ...next }), { source });
  }, [applyContextMutation, applySetupStateMutation]);

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
      requireAuthentication();
      setError('Authentication required. Please log in to continue.');
      return true;
    }
    if (status === 429) {
      setError('Rate limit exceeded. Please wait and try again.');
      return true;
    }
    setError(message || fallbackMessage);
    return false;
  }, [requireAuthentication]);

  const scriptMutationController = useMemo(() => createScriptMutationController({
    applyContextMutation,
    clearRedo,
    pushUndoAction,
    resolveCharacterName,
    normalizeSceneCharacters,
    handleAiError,
    contextRef,
    promptContextRevisionRef,
    scriptIdRef,
    activeGenerationScopeRef,
    orchestratorRef,
    setRevealScrollTargetId,
    setRevealScrollMode,
    setRevealScrollToken,
    setInsertCompleteToken,
    setUserInstruction,
    setIsGenerating,
    setError,
    setToast
  }), [
    applyContextMutation,
    clearRedo,
    pushUndoAction,
    handleAiError
  ]);

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
    blocks: allBlocks,
    availableVoices,
    characterVoicePreferences: Object.fromEntries(characterVoicePreferenceLookup),
    narratorVoicePreference
  });

  useEffect(() => {
    if (!isPreviewPlaying && !isLoadingAudio) {
      setPreviewVoiceId(null);
    }
  }, [isPreviewPlaying, isLoadingAudio]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!context?.characters) return;
    const narratorVoiceId = sanitizeVoiceIdForUsage({
      voiceId: '',
      voices: availableVoices,
      isNarrator: true,
      preference: narratorVoicePreference,
      seedKey: 'Narrator'
    });

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
      } else {
        const narratorIndex = next.findIndex((config) => (
          normalizeCharacterName(config.name) === normalizeCharacterName('Narrator')
        ));
        if (narratorIndex >= 0) {
          const current = next[narratorIndex];
          next[narratorIndex] = {
            ...current,
            voiceId: sanitizeVoiceIdForUsage({
              voiceId: current.voiceId,
              voices: availableVoices,
              isNarrator: true,
              preference: narratorVoicePreference,
              seedKey: 'Narrator'
            })
          };
        }
      }

      const assignedCharacterVoiceIds = next
        .filter((config) => normalizeCharacterName(config.name) !== normalizeCharacterName('Narrator'))
        .map((config) => config.voiceId)
        .filter(Boolean);

      context.characters.forEach((char) => {
        const preference = getVoicePreferenceForCharacter(char, characterVoicePreferenceLookup);
        if (!hasVoiceConfig(char)) {
          const voice = sanitizeVoiceIdForUsage({
            voiceId: '',
            voices: availableVoices,
            preference,
            seedKey: char,
            usedVoiceIds: assignedCharacterVoiceIds
          });
          if (voice) {
            assignedCharacterVoiceIds.push(voice);
          }
          next.push({ name: char, voiceId: voice, ...DEFAULT_VOICE_CONFIG });
          return;
        }

        const index = next.findIndex((config) => (
          normalizeCharacterName(config.name) === normalizeCharacterName(char)
        ));
        if (index < 0) return;
        const current = next[index];
        const sanitizedVoiceId = sanitizeVoiceIdForUsage({
          voiceId: current.voiceId,
          voices: availableVoices,
          preference,
          seedKey: char,
          usedVoiceIds: assignedCharacterVoiceIds
        });
        if (sanitizedVoiceId) {
          assignedCharacterVoiceIds.push(sanitizedVoiceId);
        }
        next[index] = {
          ...current,
          voiceId: sanitizedVoiceId
        };
      });

      return next;
    });
  }, [
    applyVoiceConfigMutation,
    availableVoices,
    characterVoicePreferenceLookup,
    context?.characters,
    narratorVoicePreference
  ]);

  useEffect(() => {
    if (context) {
      applySetupStateMutation((prev) => ({
        ...prev,
        genre: context.genre,
        premise: context.premise,
        characters: context.characters,
        styleId: resolveSetupStyleSelection({
          styleId: context.styleId ?? null,
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

  const resetTitleSuggestionState = useCallback(() => {
    titleSuggestionTokenRef.current += 1;
    hasManualTitleRef.current = false;
    setSuggestedTitle(null);
    setSuggestedTitleDismissed(false);
    setIsSuggestingTitle(false);
  }, []);

  const handleClearDraft = useCallback(() => {
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
    setError(null);
    setToast(null);
    clearAutosaveError();
    clearPersistedDraft();
  }, [
    applyContextMutation,
    applySetupStateMutation,
    applyVoiceConfigMutation,
    cancelAiRequest,
    clearAutosaveError,
    clearPersistedDraft,
    closeSetup,
    context,
    resetTitleSuggestionState,
    resetUndoRedo,
    stop
  ]);

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
          { purpose: 'titleSuggestion' },
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

  const handleStart = useCallback(async () => {
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
        style: resolvedSetupStyle.styleName || resolvedSetupStyle.legacyStyle || undefined,
        styleId: resolvedSetupStyle.styleId ?? undefined,
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
          applyContextMutation({
            ...initialContext,
            scenes: [normalizedFirstScene]
          });
          setRevealScrollTargetId(`scene-heading-${normalizedFirstScene.id}`);
          setRevealScrollMode('scene-generation-opening');
          setRevealScrollToken(token => token + 1);
        }
      });

      if (outcome.kind === 'failed') {
        handleAiError(outcome.error, 'Failed to generate story');
      }
    } catch (err: unknown) {
      handleAiError(err, 'Failed to generate story');
    } finally {
      if (activeGenerationScopeRef.current === scopeKeys.generateOpeningScene(scriptIdRef.current)) {
        activeGenerationScopeRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [
    applyContextMutation,
    closeSetup,
    handleAiError,
    isGenerating,
    requestTitleSuggestion,
    resetTitleSuggestionState,
    resetUndoRedo,
    resolvedSetupStyle.legacyStyle,
    resolvedSetupStyle.styleId,
    resolvedSetupStyle.styleName,
    setupState
  ]);

  const handleGenerateNext = useCallback(async () => {
    await scriptMutationController.generateNextScene({
      context,
      isGenerating,
      userInstruction
    });
  }, [context, isGenerating, scriptMutationController, userInstruction]);

  const handleTwist = useCallback(async () => {
    if (!context || isGenerating) return;
    try {
      const startedPromptContextRevision = promptContextRevisionRef.current;
      const startedUserInstruction = userInstructionRef.current;
      const recentScene = context.scenes[context.scenes.length - 1];
      const scopeKey = scopeKeys.suggestPlotTwist(scriptIdRef.current);
      activeGenerationScopeRef.current = scopeKey;
      setIsGenerating(true);
      setError(null);

      const outcome = await orchestratorRef.current.run<string>({
        opType: 'suggestPlotTwist',
        scopeKey,
        execute: (signal) => executeSuggestPlotTwist(
          context.genre,
          {
            styleId: context.styleId,
            styleName: context.style,
            style: context.style
          },
          {
            premise: context.premise,
            characters: context.characters,
            recentSceneHeading: recentScene?.heading,
            recentSceneSummary: recentScene?.summary,
            userInstruction: startedUserInstruction
          },
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
  }, [context, handleAiError, isGenerating]);

  const handleInsertAtAnchor = useCallback((anchor: ScriptAnchor, block: ScriptBlock) => {
    scriptMutationController.insertBlockAtAnchor(anchor, block);
  }, [scriptMutationController]);

  const handleGenerateInsertAtAnchor = useCallback(async (params: {
    anchor: ScriptAnchor;
    type: BlockType;
    content: string;
    character?: string;
  }) => {
    await scriptMutationController.generateInsertAtAnchor(params);
  }, [scriptMutationController]);

  const handleGenerateRewritePreview = useCallback(async (params: {
    sceneId: string;
    blockId: string;
    instructions: string;
  }) => scriptMutationController.generateRewritePreview(params), [scriptMutationController]);

  const handleApplyRewritePreview = useCallback((params: {
    sceneId: string;
    blockId: string;
    text: string;
  }) => {
    scriptMutationController.applyRewritePreview(params);
  }, [scriptMutationController]);

  const handleUpdateSceneHeading = useCallback((sceneId: string, heading: string) => {
    scriptMutationController.updateSceneHeading({
      sceneId,
      heading,
      clearRedo: true
    });
  }, [scriptMutationController]);

  const handleUndo = useCallback(() => {
    if (!context || context.scenes.length === 0) return;
    applyContextMutation((prev) => {
      if (!prev || prev.scenes.length === 0) return prev;
      const lastAction = popUndoAction();
      if (!lastAction) return prev;
      const { nextContext, applied } = scriptMutationController.applySnapshot({
        context: prev,
        action: lastAction,
        mode: 'undo'
      });
      if (!applied) {
        pushUndoAction(lastAction);
        return prev;
      }
      pushRedoAction(lastAction);
      return nextContext;
    });
  }, [applyContextMutation, context, popUndoAction, pushRedoAction, pushUndoAction, scriptMutationController]);

  const handleRedo = useCallback(() => {
    applyContextMutation((prev) => {
      const action = popRedoAction();
      if (!action) return prev;
      if (!prev) {
        pushRedoAction(action);
        return prev;
      }
      const { nextContext, applied } = scriptMutationController.applySnapshot({
        context: prev,
        action,
        mode: 'redo'
      });
      if (!applied) {
        pushRedoAction(action);
        return prev;
      }
      pushUndoAction(action);
      return nextContext;
    });
  }, [applyContextMutation, popRedoAction, pushRedoAction, pushUndoAction, scriptMutationController]);

  const handleChangeSpeaker = useCallback((sceneId: string, blockId: string, character: string) => {
    scriptMutationController.changeSpeaker(sceneId, blockId, character);
  }, [scriptMutationController]);

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
    setError(null);

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
      throw outcome.error;
    }
    return outcome.kind === 'committed';
  }, [handleAiError, updateSetupState]);

  const handleDeleteBlock = useCallback((sceneId: string, blockId: string) => {
    scriptMutationController.deleteBlock(sceneId, blockId);
  }, [scriptMutationController]);

  const updateVoiceConfig = useCallback((char: string, updates: Partial<VoiceConfig>) => {
    const normalizedChar = normalizeCharacterName(char);
    const isNarrator = normalizedChar === normalizeCharacterName('Narrator');
    const defaultVoiceId = sanitizeVoiceIdForUsage({
      voiceId: '',
      voices: availableVoices,
      isNarrator,
      preference: isNarrator
        ? narratorVoicePreference
        : getVoicePreferenceForCharacter(char, characterVoicePreferenceLookup),
      seedKey: char
    });
    let shouldClearGeneratedAudio = false;
    applyVoiceConfigMutation((prev) => {
      const existingIdx = prev.findIndex(c => normalizeCharacterName(c.name) === normalizedChar);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const current = updated[existingIdx];
        const nextConfig = {
          ...current,
          ...updates,
          voiceId: sanitizeVoiceIdForUsage({
            voiceId: typeof updates.voiceId === 'string' ? updates.voiceId : current.voiceId,
            voices: availableVoices,
            isNarrator,
            preference: isNarrator
              ? narratorVoicePreference
              : getVoicePreferenceForCharacter(char, characterVoicePreferenceLookup),
            seedKey: char
          })
        };
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
        voiceId: sanitizeVoiceIdForUsage({
          voiceId: typeof updates.voiceId === 'string' ? updates.voiceId : defaultVoiceId,
          voices: availableVoices,
          isNarrator,
          preference: isNarrator
            ? narratorVoicePreference
            : getVoicePreferenceForCharacter(char, characterVoicePreferenceLookup),
          seedKey: char
        }),
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
  }, [
    applyVoiceConfigMutation,
    availableVoices,
    characterVoicePreferenceLookup,
    clearGeneratedAudio,
    narratorVoicePreference,
    totalBufferedCount
  ]);

  const handleGlobalSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    applyVoiceConfigMutation((prev) => prev.map(config => ({ ...config, speed })));
  }, [applyVoiceConfigMutation]);

  const applyTitle = useCallback((newTitle: string, source: 'auto' | 'user') => {
    applyContextMutation((prev) => prev ? { ...prev, title: newTitle } : null);
    if (source === 'user') {
      manualTitleRevisionRef.current += 1;
      hasManualTitleRef.current = true;
    }
  }, [applyContextMutation]);

  const handleTitleChange = useCallback((newTitle: string) => {
    applyTitle(newTitle, 'user');
  }, [applyTitle]);

  const handleSaveStyle = useCallback((nextStyle: string) => {
    const resolvedStyle = resolveSetupStyleSelection({ styleId: null, style: nextStyle });
    const normalizedStyle = resolvedStyle.styleName || resolvedStyle.legacyStyle || undefined;
    const normalizedStyleId = resolvedStyle.styleId ?? undefined;
    const didMutateContext = applyContextMutation((prev) => {
      if (!prev) return prev;
      if (prev.style === normalizedStyle && (prev.styleId ?? undefined) === normalizedStyleId) {
        return prev;
      }
      return { ...prev, style: normalizedStyle, styleId: normalizedStyleId };
    });
    if (!didMutateContext) {
      return;
    }
    applySetupStateMutation((prev) => ({
      ...prev,
      styleId: resolvedStyle.styleId,
      style: normalizedStyle ?? ''
    }), {
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

  const handlePlay = useCallback(() => {
    if (!context || allBlocks.length === 0) return;
    playScript(allBlocks);
  }, [allBlocks, context, playScript]);

  const getExportMeta = useCallback(() => {
    if (!context) return null;

    const untitled = isUntitledTitle(context.title);
    if (untitled) {
      const proceed = window.confirm('You haven\'t given your masterpiece a title yet. Export as "Untitled Script"?');
      if (!proceed) {
        titleInputRef.current?.focus();
        return null;
      }
    }
    const trimmedTitle = context.title.trim();
    const displayTitle = untitled ? 'Untitled Script' : trimmedTitle;
    const fileStem = untitled
      ? 'untitled_script'
      : trimmedTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return { displayTitle, fileStem };
  }, [context, titleInputRef]);

  const handleDownload = useCallback(() => {
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
  }, [context, getExportMeta]);

  const handleExportPdf = useCallback(() => {
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
  }, [context, getExportMeta]);

  const getPreviewText = useCallback((charName: string) => {
    if (!context) return 'I am a ghost in the machine.';
    for (const scene of context.scenes) {
      for (const block of scene.blocks) {
        if (block.type === BlockType.DIALOGUE &&
            block.character?.toLowerCase().trim() === charName.toLowerCase().trim()) {
          return block.text || 'I am speechless.';
        }
      }
    }
    return `I am ${charName}, ready for my closeup.`;
  }, [context]);

  const handleModalPreview = useCallback(async (voiceId: string) => {
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
  }, [castingCharacter, getPreviewText, isPreviewPlaying, playbackSpeed, playPreview, previewVoiceId, stop, voiceConfigs]);

  const handleOpenCasting = useCallback((character: string) => {
    setCastingCharacter(character);
    setVoicesView('casting');
  }, []);

  const handleCloseCasting = useCallback(() => {
    stop();
    setPreviewVoiceId(null);
    setVoicesView('assignments');
    setCastingCharacter(null);
  }, [stop]);

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

  const defaultVoiceId = sanitizeVoiceIdForUsage({
    voiceId: '',
    voices: availableVoices,
    isNarrator: true,
    preference: narratorVoicePreference,
    seedKey: 'Narrator'
  });
  const isTtsPreviewEnabled = voiceCatalogState === 'ready' && availableVoices.length > 0;

  const voicesContent: ReactNode = context ? (
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
      <AnimatePresence mode="wait" initial={false}>
        {voicesView === 'casting' && castingCharacter ? (
          <m.div
            key={`voices-casting-${castingCharacter}`}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fadeSlideYVariants}
          >
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
          </m.div>
        ) : (
          <m.div
            key="voices-assignments"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fadeSlideYVariants}
          >
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
          </m.div>
        )}
      </AnimatePresence>
    </div>
  ) : (
    <p className="text-[11px] text-gray-500">Generate a script to unlock voice casting.</p>
  );

  const playbackProps: PlaybackPanelProps | undefined = context ? {
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
    bufferedCount,
    totalCount: totalBufferedCount,
    currentSpeaker,
    playbackSpeed,
    onPlaybackSpeedChange: handleGlobalSpeedChange,
    showHighlights,
    onToggleHighlights: () => setShowHighlights(!showHighlights),
    autoScroll,
    onToggleAutoScroll: () => setAutoScroll(!autoScroll)
  } : undefined;

  return {
    context,
    suggestedTitle,
    isSuggestingTitle,
    suggestedTitleDismissed,
    handleUseSuggestedTitle,
    handleDismissSuggestedTitle,
    handleClearDraft,
    autosaveError,
    error,
    userInstruction,
    setUserInstruction,
    handleGenerateNext,
    handleTwist,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    insertCompleteToken,
    handleChangeSpeaker,
    handleAiError,
    handleGenerateRewritePreview,
    handleApplyRewritePreview,
    handleDeleteBlock,
    handleInsertAtAnchor,
    handleGenerateInsertAtAnchor,
    handleUpdateSceneHeading,
    isGenerating,
    isPlaying,
    cancelAiRequest,
    currentBlockId,
    currentBlockIndex,
    blockStatuses,
    showHighlights,
    autoScroll,
    openPrivacy,
    openManualSetup,
    handleSaveStyle,
    isSetupOpen,
    closeSetup,
    setupState,
    updateSetupState,
    handleSetupSurprise,
    handleStart,
    setupAutoSurprise,
    handleDownload,
    handleExportPdf,
    playbackProps,
    voicesContent,
    revealScrollTargetId,
    revealScrollMode,
    revealScrollToken,
    handleTitleChange,
    isPromptDebugEnabled,
    promptDebugTraces,
    clearPromptDebugTraces,
    toast,
    authStatus,
    authError,
    isAuthLoading,
    handleLogin,
    isPrivacyOpen,
    closePrivacy
  };
}
