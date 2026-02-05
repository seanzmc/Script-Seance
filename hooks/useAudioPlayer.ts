import { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { ScriptEngine, AudioChunk } from '../services/scriptEngine';

type BlockAudioStatus = 'notGenerated' | 'generating' | 'ready' | 'error';

const PLAYABLE_BLOCKS = [BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION];
const normalizeCharacterName = (value: string) =>
  value.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

export const useAudioPlayer = (
  voiceConfigs: VoiceConfig[],
  onError?: (error: unknown, fallbackMessage: string) => void,
  onSkip?: (block: ScriptBlock, error: unknown) => void
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(-1);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const [totalBufferedCount, setTotalBufferedCount] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockAudioStatus>>({});

  // --- Refs (State that doesn't trigger re-renders or is needed in callbacks) ---
  const engineRef = useRef<ScriptEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const queueRef = useRef<ScriptBlock[]>([]);       // Playable blocks only
  const currentIndexRef = useRef(0);                // Pointer to current block in queue
  const audioDataMap = useRef<Map<string, AudioChunk>>(new Map()); // Buffer for arrived audio chunks
  const skippedBlockIdsRef = useRef<Set<string>>(new Set());
  const totalCountRef = useRef(0);
  const bufferedScriptKeyRef = useRef<string | null>(null);
  
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeBlockIdRef = useRef<string | null>(null);
  const pendingBlockIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false); // Sync ref for callbacks
  const playbackRunIdRef = useRef(0);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreOnEndedRef = useRef(false);
  const blockStatusesRef = useRef<Record<string, BlockAudioStatus>>({});
  const debug = useCallback((...args: unknown[]) => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.debug('[playback]', ...args);
    }
  }, []);

  // Store latest configs in ref for real-time access during playback loop
  const voiceConfigsRef = useRef(voiceConfigs);
  useEffect(() => {
    voiceConfigsRef.current = voiceConfigs;
  }, [voiceConfigs]);

  // Initialize Engine Singleton for this hook instance
  if (!engineRef.current) {
    engineRef.current = new ScriptEngine();
  }

  // Keep Sync Ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    blockStatusesRef.current = blockStatuses;
  }, [blockStatuses]);

  // Audio Context Singleton Lazy Loader
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
    blocks.filter(b => PLAYABLE_BLOCKS.includes(b.type));

  const getVoiceConfigForBlock = useCallback((block: ScriptBlock) => {
    let charName = block.character;
    if (!charName || block.type !== BlockType.DIALOGUE) {
      charName = 'Narrator';
    }
    const normalized = normalizeCharacterName(charName);
    return voiceConfigsRef.current.find(c => normalizeCharacterName(c.name) === normalized)
      || voiceConfigsRef.current.find(c => normalizeCharacterName(c.name) === 'narrator');
  }, []);

  const updateBufferProgress = useCallback((nextTotal?: number) => {
    const total = typeof nextTotal === 'number' ? nextTotal : totalCountRef.current;
    const ready = audioDataMap.current.size + skippedBlockIdsRef.current.size;
    totalCountRef.current = total;
    setTotalBufferedCount(total);
    setBufferedCount(ready);
    setIsBuffering(total > 0 && ready < total);
  }, []);

  const resetBuffer = useCallback(() => {
    audioDataMap.current.clear();
    skippedBlockIdsRef.current.clear();
    bufferedScriptKeyRef.current = null;
    updateBufferProgress(0);
    setBlockStatuses({});
  }, [updateBufferProgress]);

  // --- Playback Logic ---

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
    
    // Stop Audio Source
    haltActiveSource();
    
    // Stop Engine & Reset Pointers
    engineRef.current?.stop();
    queueRef.current = [];
    currentIndexRef.current = 0;
    activeBlockIdRef.current = null;
    pendingBlockIdRef.current = null;
    if (clearBuffer) {
      resetBuffer();
    }
  }, [clearStartTimeout, debug, haltActiveSource, resetBuffer]);

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

    // End of script?
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

    // CHECK BUFFER: Do we have the audio for this block yet?
    const chunk = audioDataMap.current.get(block.id);

    if (chunk) {
      // YES: Audio is ready. Play immediately.
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
      
      // Look up live client-side modifiers (Speed/Pitch)
      // This allows sliders to affect ongoing playback without restarting
      const config = getVoiceConfigForBlock(block);

      const speed = config?.speed ?? chunk.speed; // Fallback to chunk's speed if config missing (unlikely)
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
        // Advance pointer and loop
        currentIndexRef.current++;
        playNext(runId);
      };
      
      source.start();
      pendingBlockIdRef.current = null;

    } else {
      // NO: Audio is still generating.
      // Show loading and wait. The 'audio' event listener will re-trigger playNext() when it arrives.
      setIsLoadingAudio(true);
      setCurrentBlockId(block.id); // Visually focus the block so user knows where we are
      pendingBlockIdRef.current = null;
    }
  }, [debug, getContext, getVoiceConfigForBlock, stop]);

  // --- Event Bindings ---

  useEffect(() => {
    const engine = engineRef.current!;

    const onAudio = (chunk: AudioChunk) => {
      // 1. Store the chunk in buffer
      audioDataMap.current.set(chunk.blockId, chunk);
      setBlockStatuses(prev => ({ ...prev, [chunk.blockId]: 'ready' }));
      updateBufferProgress();
      
      // 2. If we are currently stalled waiting for THIS specific block, resume playback
      if (isPlayingRef.current) {
        const currentBlock = queueRef.current[currentIndexRef.current];
        if (
          currentBlock &&
          currentBlock.id === chunk.blockId &&
          !activeSourceRef.current &&
          pendingBlockIdRef.current !== chunk.blockId
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
          setBlockStatuses(prev => ({ ...prev, [blockId]: 'error' }));
          const skippedBlock = queueRef.current.find(block => block.id === blockId);
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
  }, [onError, onSkip]); 

  // --- Public Methods ---

  const playScript = (blocks: ScriptBlock[]) => {
    const playableBlocks = getPlayableBlocks(blocks);
    const bufferKey = playableBlocks.map(block => block.id).join('|');
    const canReuseBuffer =
      bufferKey.length > 0 &&
      bufferKey === bufferedScriptKeyRef.current &&
      audioDataMap.current.size > 0;

    stop({ clearBuffer: !canReuseBuffer });
    queueRef.current = playableBlocks;
    currentIndexRef.current = 0;
    setCurrentBlockIndex(playableBlocks.length > 0 ? 0 : -1);
    setIsPaused(false);
    bufferedScriptKeyRef.current = bufferKey || null;
    updateBufferProgress(playableBlocks.length);
    setBlockStatuses(() => {
      const nextStatuses: Record<string, BlockAudioStatus> = {};
      playableBlocks.forEach(block => {
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

    // Tiny delay to ensure stop cleanup finishes
    startTimeoutRef.current = setTimeout(() => {
      startTimeoutRef.current = null;
      playbackRunIdRef.current += 1;
      setIsPlaying(true);
      isPlayingRef.current = true;
      engineRef.current?.start(blocks, voiceConfigs);
      playNext(playbackRunIdRef.current);
    }, 10);
  };

  const bufferScript = (blocks: ScriptBlock[]) => {
    const playableBlocks = getPlayableBlocks(blocks);
    stop({ clearBuffer: true });
    queueRef.current = playableBlocks;
    currentIndexRef.current = 0;
    setCurrentBlockIndex(-1);
    setIsPaused(false);
    bufferedScriptKeyRef.current = playableBlocks.map(block => block.id).join('|') || null;
    updateBufferProgress(playableBlocks.length);
    setBlockStatuses(() => {
      const nextStatuses: Record<string, BlockAudioStatus> = {};
      playableBlocks.forEach(block => {
        nextStatuses[block.id] = 'generating';
      });
      return nextStatuses;
    });
    engineRef.current?.start(blocks, voiceConfigs);
  };

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
    setBlockStatuses(prev => ({ ...prev, [block.id]: 'generating' }));
    skippedBlockIdsRef.current.delete(block.id);
    updateBufferProgress();

    try {
      const config = getVoiceConfigForBlock(block);
      const buffer = await engineRef.current?.generateSingle(block.text, config?.voiceId || 'Zephyr');
      if (!buffer) {
        setBlockStatuses(prev => ({ ...prev, [block.id]: 'error' }));
        return;
      }
      audioDataMap.current.set(block.id, {
        blockId: block.id,
        audioBuffer: buffer,
        voiceId: config?.voiceId || 'Zephyr',
        speed: config?.speed ?? 1,
        pitch: config?.pitch ?? 0
      });
      setBlockStatuses(prev => ({ ...prev, [block.id]: 'ready' }));
      updateBufferProgress();
      if (isPaused) {
        return;
      }
      if (isPlayingRef.current) {
        playNext(playbackRunIdRef.current);
      }
    } catch (error: unknown) {
      console.error(error);
      setBlockStatuses(prev => ({ ...prev, [block.id]: 'error' }));
      onError?.(error, 'Audio generation failed.');
    }
  }, [getVoiceConfigForBlock, isPaused, onError, playNext, updateBufferProgress]);

  const skipCurrentBlock = useCallback(() => {
    const block = queueRef.current[currentIndexRef.current];
    if (!block) return;
    skippedBlockIdsRef.current.add(block.id);
    setBlockStatuses(prev => ({ ...prev, [block.id]: 'error' }));
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

  const playPreview = async (text: string, config: VoiceConfig) => {
    stop({ clearBuffer: false });
    setIsLoadingAudio(true);
    // Note: isPreviewPlaying remains false during loading phase
    
    try {
      // Use engine for preview to benefit from caching
      const buffer = await engineRef.current?.generateSingle(text, config.voiceId);
      if (!buffer) {
         setIsLoadingAudio(false);
         return;
      }

      const ctx = getContext();
      const audioBuffer = await decodePCM(buffer, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = config.speed || 1;
      source.detune.value = (config.pitch || 0) * 100;

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
    } catch (error: unknown) {
      console.error(error);
      onError?.(error, 'Preview audio failed.');
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
  };
};

// Helper: Decode Raw PCM from Gemini
const decodePCM = async (buffer: ArrayBuffer, ctx: AudioContext): Promise<AudioBuffer> => {
  // Defensive copy
  const copy = buffer.slice(0);
  
  const numChannels = 1;
  const sampleRate = 24000; // Gemini 2.5 TTS standard rate
  const dataInt16 = new Int16Array(copy);
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
