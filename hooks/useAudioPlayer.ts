import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { ScriptEngine, AudioChunk } from '../services/scriptEngine';
import { DEFAULT_VOICE_CONFIG } from '../shared/voiceDefaults.js';
import { GenerationOrchestrator, scopeKeys } from '../services/orchestration';

type BlockAudioStatus = 'notGenerated' | 'generating' | 'ready' | 'error';

const PLAYABLE_BLOCKS = [BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION];
const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

export type AudioOrchestrationContext = {
  scriptId?: string;
  voiceContextRevision?: number;
  blocks?: ScriptBlock[];
};

type PlaybackGate = {
  playbackRunId: number;
  voiceContextRevision: number;
  blockRevisions: Map<string, number>;
  receiptOpId: string;
};

const createAbortError = () => {
  const error = new Error('Request canceled.') as Error & { code?: string };
  error.code = 'REQUEST_ABORTED';
  return error;
};

export const useAudioPlayer = (
  voiceConfigs: VoiceConfig[],
  onError?: (error: unknown, fallbackMessage: string) => void,
  onSkip?: (block: ScriptBlock, error: unknown) => void,
  orchestrationContext?: AudioOrchestrationContext
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(-1);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const [totalBufferedCount, setTotalBufferedCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockAudioStatus>>({});

  // --- Refs (State that doesn't trigger re-renders or is needed in callbacks) ---
  const engineRef = useRef<ScriptEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const queueRef = useRef<ScriptBlock[]>([]);
  const currentIndexRef = useRef(0);
  const audioDataMap = useRef<Map<string, AudioChunk>>(new Map());
  const skippedBlockIdsRef = useRef<Set<string>>(new Set());
  const totalCountRef = useRef(0);
  const bufferedAudioSignatureRef = useRef<string | null>(null);

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeBlockIdRef = useRef<string | null>(null);
  const pendingBlockIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const playbackRunIdRef = useRef(0);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreOnEndedRef = useRef(false);
  const blockStatusesRef = useRef<Record<string, BlockAudioStatus>>({});

  const orchestratorRef = useRef(new GenerationOrchestrator());
  const scriptIdRef = useRef(orchestrationContext?.scriptId || 'local-script');
  const voiceContextRevisionRef = useRef(orchestrationContext?.voiceContextRevision ?? 0);
  const blockRevisionByIdRef = useRef<Map<string, number>>(new Map());
  const activePlaybackGateRef = useRef<PlaybackGate | null>(null);
  const activePreviewScopeRef = useRef<string | null>(null);
  const activeRetryScopeRef = useRef<string | null>(null);

  const debug = useCallback((...args: unknown[]) => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.debug('[playback]', ...args);
    }
  }, []);

  const voiceConfigsRef = useRef(voiceConfigs);
  useEffect(() => {
    voiceConfigsRef.current = voiceConfigs;
  }, [voiceConfigs]);

  useEffect(() => {
    scriptIdRef.current = orchestrationContext?.scriptId || 'local-script';
  }, [orchestrationContext?.scriptId]);

  useEffect(() => {
    voiceContextRevisionRef.current = orchestrationContext?.voiceContextRevision ?? 0;
  }, [orchestrationContext?.voiceContextRevision]);

  const currentBlockRevisionMap = useMemo(() => {
    const nextMap = new Map<string, number>();
    orchestrationContext?.blocks?.forEach((block) => {
      nextMap.set(block.id, block.blockRevision);
    });
    return nextMap;
  }, [orchestrationContext?.blocks]);
  blockRevisionByIdRef.current = currentBlockRevisionMap;

  if (!engineRef.current) {
    engineRef.current = new ScriptEngine();
  }

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    blockStatusesRef.current = blockStatuses;
  }, [blockStatuses]);

  const getContext = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new Ctx({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const getPlayableBlocks = (blocks: ScriptBlock[]) =>
    blocks.filter((block) => PLAYABLE_BLOCKS.includes(block.type));

  const getCurrentBlockRevision = useCallback((blockId: string) => {
    const fromContext = blockRevisionByIdRef.current.get(blockId);
    if (typeof fromContext === 'number') {
      return fromContext;
    }
    return queueRef.current.find((block) => block.id === blockId)?.blockRevision;
  }, []);

  const getVoiceConfigForBlock = useCallback((block: ScriptBlock) => {
    let charName = block.character;
    if (!charName || block.type !== BlockType.DIALOGUE) {
      charName = 'Narrator';
    }
    const normalized = normalizeCharacterName(charName);
    return voiceConfigsRef.current.find((config) => normalizeCharacterName(config.name) === normalized)
      || voiceConfigsRef.current.find((config) => normalizeCharacterName(config.name) === 'narrator');
  }, []);

  const getFallbackVoiceId = useCallback(() => {
    const narrator = voiceConfigsRef.current.find((config) => normalizeCharacterName(config.name) === 'narrator');
    if (typeof narrator?.voiceId === 'string' && narrator.voiceId.trim().length > 0) {
      return narrator.voiceId;
    }
    const firstConfiguredVoice = voiceConfigsRef.current.find((config) => (
      typeof config.voiceId === 'string' && config.voiceId.trim().length > 0
    ));
    return firstConfiguredVoice?.voiceId || '';
  }, []);

  const updateBufferProgress = useCallback((nextTotal?: number) => {
    const total = typeof nextTotal === 'number' ? nextTotal : totalCountRef.current;
    const ready = audioDataMap.current.size + skippedBlockIdsRef.current.size;
    totalCountRef.current = total;
    setTotalBufferedCount(total);
    setBufferedCount(ready);
  }, []);

  const resetBuffer = useCallback(() => {
    audioDataMap.current.clear();
    skippedBlockIdsRef.current.clear();
    bufferedAudioSignatureRef.current = null;
    updateBufferProgress(0);
    setBlockStatuses({});
  }, [updateBufferProgress]);

  const clearStartTimeout = useCallback(() => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
  }, []);

  const haltActiveSource = useCallback(() => {
    if (activeSourceRef.current) {
      ignoreOnEndedRef.current = true;
      try {
        activeSourceRef.current.stop();
      } catch {
        // Ignore errors when stopping an already-stopped node.
      }
      try {
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore disconnect errors on stopped nodes.
      }
      activeSourceRef.current = null;
    }
    activeBlockIdRef.current = null;
    pendingBlockIdRef.current = null;
  }, []);

  const getPlaybackScopeKey = useCallback(() => (
    scopeKeys.ttsPlaybackPrefetch(scriptIdRef.current)
  ), []);

  const stop = useCallback((options?: { clearBuffer?: boolean }) => {
    const clearBuffer = options?.clearBuffer ?? false;
    clearStartTimeout();
    playbackRunIdRef.current += 1;
    debug('stopped');
    setIsPlaying(false);
    setIsPaused(false);
    setIsPreviewPlaying(false);
    isPlayingRef.current = false;
    setCurrentBlockId(null);
    setCurrentBlockIndex(-1);
    setIsLoadingAudio(false);

    haltActiveSource();

    orchestratorRef.current.cancelScope(getPlaybackScopeKey());
    if (activePreviewScopeRef.current) {
      orchestratorRef.current.cancelScope(activePreviewScopeRef.current);
      activePreviewScopeRef.current = null;
    }
    if (activeRetryScopeRef.current) {
      orchestratorRef.current.cancelScope(activeRetryScopeRef.current);
      activeRetryScopeRef.current = null;
    }

    activePlaybackGateRef.current = null;
    engineRef.current?.stop();
    queueRef.current = [];
    currentIndexRef.current = 0;
    activeBlockIdRef.current = null;
    pendingBlockIdRef.current = null;
    if (clearBuffer) {
      resetBuffer();
    }
  }, [clearStartTimeout, debug, getPlaybackScopeKey, haltActiveSource, resetBuffer]);

  useEffect(() => {
    return () => {
      stop({ clearBuffer: true });
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
      audioContextRef.current = null;
    };
  }, [stop]);

  const playNext = useCallback(async (runId: number) => {
    if (!isPlayingRef.current || runId !== playbackRunIdRef.current) return;

    const idx = currentIndexRef.current;
    const script = queueRef.current;

    if (idx >= script.length) {
      stop();
      return;
    }

    const block = script[idx];
    setCurrentBlockIndex(idx);
    if (activeSourceRef.current) {
      return;
    }
    if (pendingBlockIdRef.current === block.id && !activeSourceRef.current) {
      return;
    }

    const isSkipped = skippedBlockIdsRef.current.has(block.id);
    if (blockStatusesRef.current[block.id] === 'error' && !isSkipped) {
      setIsPlaying(false);
      setIsPaused(true);
      isPlayingRef.current = false;
      setIsLoadingAudio(false);
      return;
    }

    if (isSkipped) {
      currentIndexRef.current++;
      playNext(runId);
      return;
    }

    const chunk = audioDataMap.current.get(block.id);

    if (chunk) {
      setIsLoadingAudio(false);
      setCurrentBlockId(block.id);
      pendingBlockIdRef.current = block.id;

      const ctx = getContext();
      const audioBuffer = await decodePCM(chunk.audioBuffer, ctx);

      if (!isPlayingRef.current || runId !== playbackRunIdRef.current) {
        pendingBlockIdRef.current = null;
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const config = getVoiceConfigForBlock(block);
      const speed = config?.speed ?? chunk.speed;
      const pitch = config?.pitch ?? chunk.pitch;

      source.playbackRate.value = speed;
      source.detune.value = pitch * 100;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.92;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      activeSourceRef.current = source;
      activeBlockIdRef.current = block.id;
      ignoreOnEndedRef.current = false;
      debug('start block', idx, block.id);

      source.onended = () => {
        if (ignoreOnEndedRef.current || !isPlayingRef.current || runId !== playbackRunIdRef.current) {
          activeSourceRef.current = null;
          activeBlockIdRef.current = null;
          pendingBlockIdRef.current = null;
          return;
        }
        activeSourceRef.current = null;
        activeBlockIdRef.current = null;
        pendingBlockIdRef.current = null;
        debug('end block', idx, block.id);
        currentIndexRef.current++;
        playNext(runId);
      };

      source.start();
      pendingBlockIdRef.current = null;
    } else {
      setIsLoadingAudio(true);
      setCurrentBlockId(block.id);
      pendingBlockIdRef.current = null;
    }
  }, [debug, getContext, getVoiceConfigForBlock, stop]);

  const isPlaybackChunkFresh = useCallback((chunk: AudioChunk) => {
    const gate = activePlaybackGateRef.current;
    if (!gate) {
      return false;
    }

    if (chunk.playbackRunId !== undefined && chunk.playbackRunId !== gate.playbackRunId) {
      return false;
    }
    if (playbackRunIdRef.current !== gate.playbackRunId) {
      return false;
    }
    if (voiceContextRevisionRef.current !== gate.voiceContextRevision) {
      return false;
    }

    const startedRevision = gate.blockRevisions.get(chunk.blockId);
    if (typeof startedRevision !== 'number') {
      return false;
    }

    const currentRevision = getCurrentBlockRevision(chunk.blockId);
    return currentRevision === startedRevision;
  }, [getCurrentBlockRevision]);

  useEffect(() => {
    const engine = engineRef.current!;

    const onAudio = (chunk: AudioChunk) => {
      if (!isPlaybackChunkFresh(chunk)) {
        return;
      }

      audioDataMap.current.set(chunk.blockId, chunk);
      setBlockStatuses((prev) => ({ ...prev, [chunk.blockId]: 'ready' }));
      updateBufferProgress();

      if (isPlayingRef.current) {
        const currentBlock = queueRef.current[currentIndexRef.current];
        if (
          currentBlock
          && currentBlock.id === chunk.blockId
          && !activeSourceRef.current
          && pendingBlockIdRef.current !== chunk.blockId
        ) {
          playNext(playbackRunIdRef.current);
        }
      }
    };

    engine.on('audio', onAudio);
    const onEngineError = (payload: { error: unknown }) => {
      const blockId = (payload as { blockId?: string }).blockId;
      const skipped = (payload as { skipped?: boolean }).skipped;
      if (skipped && blockId) {
        if (blockStatusesRef.current[blockId] !== 'error') {
          setBlockStatuses((prev) => ({ ...prev, [blockId]: 'error' }));
          const skippedBlock = queueRef.current.find((block) => block.id === blockId);
          if (skippedBlock) {
            onSkip?.(skippedBlock, payload.error);
          }
        }
        updateBufferProgress();

        if (isPlayingRef.current) {
          const currentBlock = queueRef.current[currentIndexRef.current];
          if (currentBlock && currentBlock.id === blockId) {
            setIsPlaying(false);
            setIsPaused(true);
            isPlayingRef.current = false;
            setIsLoadingAudio(false);
          }
        }
        return;
      }
      onError?.(payload.error, 'Audio generation failed.');
    };
    engine.on('error', onEngineError);

    return () => {
      engine.off('audio', onAudio);
      engine.off('error', onEngineError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError, onSkip, isPlaybackChunkFresh]);

  const getAudioGenerationSignature = useCallback((blocks: ScriptBlock[]) => {
    return blocks
      .filter((block) => PLAYABLE_BLOCKS.includes(block.type))
      .map((block) => {
        const config = getVoiceConfigForBlock(block);
        const voiceId = config?.voiceId || getFallbackVoiceId();
        const expressive = config?.expressive ? 'expr' : 'plain';
        return `${block.id}:${block.blockRevision}:${voiceId}:${expressive}`;
      })
      .join('|');
  }, [getFallbackVoiceId, getVoiceConfigForBlock]);

  const startPlaybackGeneration = useCallback((blocks: ScriptBlock[], playbackRunId: number, forceRegenerate: boolean) => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const scopeKey = getPlaybackScopeKey();
    const startedVoiceContextRevision = voiceContextRevisionRef.current;
    const playable = getPlayableBlocks(blocks);
    const blockRevisions = new Map(playable.map((block) => [block.id, block.blockRevision]));

    void orchestratorRef.current.run<void>({
      opType: forceRegenerate ? 'ttsPlaybackRefresh' : 'ttsPlaybackPrefetch',
      scopeKey,
      metadata: {
        playbackRunId,
        voiceContextRevision: startedVoiceContextRevision,
        blockRevisionSnapshot: Object.fromEntries(blockRevisions)
      },
      execute: (signal, receipt) => new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          engine.stop();
          reject(createAbortError());
        };
        const onComplete = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          signal.removeEventListener('abort', onAbort);
          engine.off('complete', onComplete);
        };

        activePlaybackGateRef.current = {
          playbackRunId,
          voiceContextRevision: startedVoiceContextRevision,
          blockRevisions,
          receiptOpId: receipt.opId
        };

        signal.addEventListener('abort', onAbort, { once: true });
        engine.on('complete', onComplete);
        void engine.start(blocks, voiceConfigsRef.current, {
          clearCache: forceRegenerate,
          playbackRunId
        });
      }),
      isFresh: () => {
        if (playbackRunIdRef.current !== playbackRunId) {
          return false;
        }
        if (voiceContextRevisionRef.current !== startedVoiceContextRevision) {
          return false;
        }
        for (const [blockId, startedRevision] of blockRevisions) {
          if (getCurrentBlockRevision(blockId) !== startedRevision) {
            return false;
          }
        }
        return true;
      },
      commit: () => {
        // Playback commits progressively via gated `audio` chunks.
      }
    }).then((outcome) => {
      if (outcome.kind === 'failed') {
        onError?.(outcome.error, 'Audio generation failed.');
      }
    });
  }, [getCurrentBlockRevision, getPlaybackScopeKey, onError]);

  const playScript = (blocks: ScriptBlock[], options?: { forceRegenerate?: boolean }) => {
    const playableBlocks = getPlayableBlocks(blocks);
    const audioSignature = getAudioGenerationSignature(blocks);
    const canReuseBuffer =
      !options?.forceRegenerate
      && audioSignature.length > 0
      && audioSignature === bufferedAudioSignatureRef.current
      && audioDataMap.current.size > 0;

    stop({ clearBuffer: !canReuseBuffer });
    queueRef.current = playableBlocks;
    currentIndexRef.current = 0;
    setCurrentBlockIndex(playableBlocks.length > 0 ? 0 : -1);
    setIsPaused(false);
    bufferedAudioSignatureRef.current = audioSignature || null;
    updateBufferProgress(playableBlocks.length);
    setBlockStatuses(() => {
      const nextStatuses: Record<string, BlockAudioStatus> = {};
      playableBlocks.forEach((block) => {
        if (canReuseBuffer && audioDataMap.current.has(block.id)) {
          nextStatuses[block.id] = 'ready';
        } else if (canReuseBuffer && skippedBlockIdsRef.current.has(block.id)) {
          nextStatuses[block.id] = 'error';
        } else {
          nextStatuses[block.id] = 'generating';
        }
      });
      return nextStatuses;
    });

    if (playableBlocks.length === 0) {
      return;
    }

    const nextRunId = playbackRunIdRef.current + 1;
    startTimeoutRef.current = setTimeout(() => {
      startTimeoutRef.current = null;
      playbackRunIdRef.current = nextRunId;
      setIsPlaying(true);
      isPlayingRef.current = true;
      startPlaybackGeneration(blocks, nextRunId, Boolean(options?.forceRegenerate));
      playNext(nextRunId);
    }, 10);
  };

  const clearGeneratedAudio = useCallback((options?: { clearGlobalCache?: boolean }) => {
    stop({ clearBuffer: true });
    if (options?.clearGlobalCache) {
      (engineRef.current as { clearAudioCache?: () => void } | null)?.clearAudioCache?.();
    }
  }, [stop]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    clearStartTimeout();
    playbackRunIdRef.current += 1;
    debug('paused');
    setIsPlaying(false);
    setIsPaused(true);
    isPlayingRef.current = false;
    setIsLoadingAudio(false);
    haltActiveSource();
  }, [clearStartTimeout, debug, haltActiveSource]);

  const resume = useCallback(() => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    clearStartTimeout();
    setIsPaused(false);
    setIsPlaying(true);
    isPlayingRef.current = true;
    debug('resumed');
    if (currentIndexRef.current < 0) {
      currentIndexRef.current = 0;
      setCurrentBlockIndex(0);
    }
    playbackRunIdRef.current += 1;
    playNext(playbackRunIdRef.current);
  }, [clearStartTimeout, debug, playNext]);

  const jumpToIndex = useCallback((targetIndex: number, autoPlay: boolean) => {
    const nextIndex = Math.max(0, Math.min(targetIndex, queueRef.current.length - 1));
    if (!Number.isFinite(nextIndex)) return;
    clearStartTimeout();
    playbackRunIdRef.current += 1;
    currentIndexRef.current = nextIndex;
    setCurrentBlockIndex(nextIndex);
    const nextBlock = queueRef.current[nextIndex];
    setCurrentBlockId(nextBlock?.id ?? null);
    setIsLoadingAudio(false);
    haltActiveSource();
    if (autoPlay) {
      setIsPaused(false);
      setIsPlaying(true);
      isPlayingRef.current = true;
      playNext(playbackRunIdRef.current);
    }
  }, [clearStartTimeout, haltActiveSource, playNext]);

  const goToNext = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const autoPlay = isPlayingRef.current;
    jumpToIndex(currentIndexRef.current + 1, autoPlay);
  }, [jumpToIndex]);

  const goToPrevious = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const autoPlay = isPlayingRef.current;
    jumpToIndex(currentIndexRef.current - 1, autoPlay);
  }, [jumpToIndex]);

  const retryCurrentBlock = useCallback(async () => {
    const block = queueRef.current[currentIndexRef.current];
    if (!block) return;

    const config = getVoiceConfigForBlock(block);
    const voiceId = config?.voiceId || getFallbackVoiceId();
    const startedVoiceContextRevision = voiceContextRevisionRef.current;
    const startedBlockRevision = getCurrentBlockRevision(block.id) ?? block.blockRevision;
    const scopeKey = scopeKeys.ttsBlockRetry(scriptIdRef.current, block.id);

    setBlockStatuses((prev) => ({ ...prev, [block.id]: 'generating' }));
    skippedBlockIdsRef.current.delete(block.id);
    updateBufferProgress();

    activeRetryScopeRef.current = scopeKey;
    const outcome = await orchestratorRef.current.run<AudioChunk>({
      opType: 'ttsBlockRetry',
      scopeKey,
      metadata: {
        playbackRunId: playbackRunIdRef.current,
        voiceContextRevision: startedVoiceContextRevision,
        blockRevision: startedBlockRevision
      },
      execute: async (signal) => {
        const buffer = await engineRef.current?.generateSingle(block.text, voiceId, {
          expressive: config?.expressive ?? DEFAULT_VOICE_CONFIG.expressive,
          signal,
          requestId: `retry:${block.id}:${Date.now()}`
        });
        if (!buffer) {
          throw new Error('No audio data returned.');
        }
        return {
          blockId: block.id,
          audioBuffer: buffer,
          voiceId,
          speed: config?.speed ?? DEFAULT_VOICE_CONFIG.speed,
          pitch: config?.pitch ?? DEFAULT_VOICE_CONFIG.pitch,
          expressive: config?.expressive ?? DEFAULT_VOICE_CONFIG.expressive
        };
      },
      isFresh: () => (
        voiceContextRevisionRef.current === startedVoiceContextRevision
        && (getCurrentBlockRevision(block.id) ?? block.blockRevision) === startedBlockRevision
      ),
      commit: (chunk) => {
        audioDataMap.current.set(block.id, chunk);
        setBlockStatuses((prev) => ({ ...prev, [block.id]: 'ready' }));
        updateBufferProgress();
        if (isPaused) {
          return;
        }
        if (isPlayingRef.current) {
          playNext(playbackRunIdRef.current);
        }
      }
    });

    if (activeRetryScopeRef.current === scopeKey) {
      activeRetryScopeRef.current = null;
    }

    if (outcome.kind === 'failed') {
      setBlockStatuses((prev) => ({ ...prev, [block.id]: 'error' }));
      onError?.(outcome.error, 'Audio generation failed.');
      return;
    }

    if (outcome.kind === 'aborted' || outcome.kind === 'dropped') {
      setBlockStatuses((prev) => ({ ...prev, [block.id]: 'notGenerated' }));
    }
  }, [getCurrentBlockRevision, getFallbackVoiceId, getVoiceConfigForBlock, isPaused, onError, playNext, updateBufferProgress]);

  const skipCurrentBlock = useCallback(() => {
    const block = queueRef.current[currentIndexRef.current];
    if (!block) return;
    skippedBlockIdsRef.current.add(block.id);
    setBlockStatuses((prev) => ({ ...prev, [block.id]: 'error' }));
    updateBufferProgress();

    if (isPlayingRef.current) {
      playbackRunIdRef.current += 1;
      haltActiveSource();
      currentIndexRef.current++;
      playNext(playbackRunIdRef.current);
      return;
    }
    if (isPaused) {
      currentIndexRef.current = Math.min(currentIndexRef.current + 1, queueRef.current.length - 1);
      setCurrentBlockIndex(currentIndexRef.current);
      setCurrentBlockId(queueRef.current[currentIndexRef.current]?.id ?? null);
    }
  }, [haltActiveSource, isPaused, playNext, updateBufferProgress]);

  const playPreview = async (
    text: string,
    config: VoiceConfig,
    options?: { scopeId?: string }
  ) => {
    stop({ clearBuffer: false });
    setIsLoadingAudio(true);

    const startedVoiceContextRevision = voiceContextRevisionRef.current;
    const scopeIdentity = options?.scopeId || config.voiceId;
    const scopeKey = scopeKeys.ttsPreview(scriptIdRef.current, scopeIdentity);
    activePreviewScopeRef.current = scopeKey;

    const outcome = await orchestratorRef.current.run<ArrayBuffer>({
      opType: 'ttsPreview',
      scopeKey,
      metadata: {
        voiceContextRevision: startedVoiceContextRevision,
        scopeIdentity
      },
      execute: async (signal) => {
        const buffer = await engineRef.current?.generateSingle(text, config.voiceId, {
          expressive: config.expressive || false,
          signal,
          requestId: `preview:${scopeIdentity}:${Date.now()}`
        });
        if (!buffer) {
          throw new Error('No audio data returned.');
        }
        return buffer;
      },
      isFresh: () => voiceContextRevisionRef.current === startedVoiceContextRevision,
      commit: async (buffer) => {
        const ctx = getContext();
        const audioBuffer = await decodePCM(buffer, ctx);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = config.speed ?? DEFAULT_VOICE_CONFIG.speed;
        source.detune.value = (config.pitch ?? DEFAULT_VOICE_CONFIG.pitch) * 100;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.92;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        activeSourceRef.current = source;

        source.onended = () => {
          setIsLoadingAudio(false);
          setIsPreviewPlaying(false);
          activeSourceRef.current = null;
        };

        setIsLoadingAudio(false);
        setIsPreviewPlaying(true);
        source.start();
      }
    });

    if (activePreviewScopeRef.current === scopeKey) {
      activePreviewScopeRef.current = null;
    }

    if (outcome.kind === 'failed') {
      onError?.(outcome.error, 'Preview audio failed.');
      setIsLoadingAudio(false);
      setIsPreviewPlaying(false);
      return;
    }

    if (outcome.kind === 'aborted' || outcome.kind === 'dropped') {
      setIsLoadingAudio(false);
      setIsPreviewPlaying(false);
    }
  };

  return {
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
  };
};

const tryDecodeAudioData = async (buffer: ArrayBuffer, ctx: AudioContext): Promise<AudioBuffer | null> => {
  try {
    // decodeAudioData may detach/consume the input buffer; always pass a copy.
    return await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    return null;
  }
};

// Helper: Decode encoded audio first (WAV/MP3/etc.), then fall back to raw LINEAR16 PCM.
const decodePCM = async (buffer: ArrayBuffer, ctx: AudioContext): Promise<AudioBuffer> => {
  const decoded = await tryDecodeAudioData(buffer, ctx);
  if (decoded) {
    return decoded;
  }

  const copy = buffer.slice(0);
  const safeByteLength = copy.byteLength - (copy.byteLength % 2);
  const numChannels = 1;
  const sampleRate = 24000;
  const dataInt16 = new Int16Array(copy, 0, safeByteLength / 2);
  const frameCount = dataInt16.length / numChannels;

  const audioBuffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return audioBuffer;
};
