import { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { ScriptEngine, AudioChunk } from '../services/scriptEngine';

export const useAudioPlayer = (
  voiceConfigs: VoiceConfig[],
  onError?: (error: unknown, fallbackMessage: string) => void,
  onSkip?: (block: ScriptBlock, error: unknown) => void
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const [totalBufferedCount, setTotalBufferedCount] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  // --- Refs (State that doesn't trigger re-renders or is needed in callbacks) ---
  const engineRef = useRef<ScriptEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const queueRef = useRef<ScriptBlock[]>([]);       // The full script to play
  const currentIndexRef = useRef(0);                // Pointer to current block in queue
  const audioDataMap = useRef<Map<string, AudioChunk>>(new Map()); // Buffer for arrived audio chunks
  const skippedBlockIdsRef = useRef<Set<string>>(new Set());
  const totalCountRef = useRef(0);
  const bufferedScriptKeyRef = useRef<string | null>(null);
  
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false); // Sync ref for callbacks

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

  // Audio Context Singleton Lazy Loader
  const getContext = () => {
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
  };

  const getPlayableBlocks = (blocks: ScriptBlock[]) =>
    blocks.filter(b => [BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION].includes(b.type));

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
  }, [updateBufferProgress]);

  // --- Playback Logic ---

  const stop = useCallback((options?: { clearBuffer?: boolean }) => {
    const clearBuffer = options?.clearBuffer ?? false;
    setIsPlaying(false);
    setIsPreviewPlaying(false);
    isPlayingRef.current = false;
    setCurrentBlockId(null);
    setIsLoadingAudio(false);
    
    // Stop Audio Source
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        // Ignore errors when stopping an already-stopped node.
      }
      activeSourceRef.current = null;
    }
    
    // Stop Engine & Reset Pointers
    engineRef.current?.stop();
    queueRef.current = [];
    currentIndexRef.current = 0;
    if (clearBuffer) {
      resetBuffer();
    }
  }, [resetBuffer]);

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

  const playNext = async () => {
    if (!isPlayingRef.current) return;

    const idx = currentIndexRef.current;
    const script = queueRef.current;

    // End of script?
    if (idx >= script.length) {
      stop();
      return;
    }

    const block = script[idx];
    
    // Skip silent blocks (headings)
    if (![BlockType.DIALOGUE, BlockType.ACTION, BlockType.TRANSITION].includes(block.type)) {
      currentIndexRef.current++;
      playNext();
      return;
    }

    if (skippedBlockIdsRef.current.has(block.id)) {
      currentIndexRef.current++;
      playNext();
      return;
    }

    // CHECK BUFFER: Do we have the audio for this block yet?
    const chunk = audioDataMap.current.get(block.id);

    if (chunk) {
      // YES: Audio is ready. Play immediately.
      setIsLoadingAudio(false);
      setCurrentBlockId(block.id);
      
      const ctx = getContext();
      // Decode raw PCM
      const audioBuffer = await decodePCM(chunk.audioBuffer, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      
      // Look up live client-side modifiers (Speed/Pitch)
      // This allows sliders to affect ongoing playback without restarting
      let charName = block.character;
      if (!charName || block.type !== BlockType.DIALOGUE) {
          charName = 'Narrator';
      }

      // Case-insensitive match for config
      const config = voiceConfigsRef.current.find(c => c.name.toLowerCase().trim() === charName?.toLowerCase().trim()) 
                  || voiceConfigsRef.current.find(c => c.name === 'Narrator');

      const speed = config?.speed ?? chunk.speed; // Fallback to chunk's speed if config missing (unlikely)
      const pitch = config?.pitch ?? chunk.pitch;

      source.playbackRate.value = speed;
      source.detune.value = pitch * 100;
      
      source.connect(ctx.destination);
      activeSourceRef.current = source;
      
      source.onended = () => {
        if (isPlayingRef.current) {
           activeSourceRef.current = null;
           // Advance pointer and loop
           currentIndexRef.current++;
           playNext();
        }
      };
      
      source.start();

    } else {
      // NO: Audio is still generating.
      // Show loading and wait. The 'audio' event listener will re-trigger playNext() when it arrives.
      setIsLoadingAudio(true);
      setCurrentBlockId(block.id); // Visually focus the block so user knows where we are
    }
  };

  // --- Event Bindings ---

  useEffect(() => {
    const engine = engineRef.current!;

    const onAudio = (chunk: AudioChunk) => {
      // 1. Store the chunk in buffer
      audioDataMap.current.set(chunk.blockId, chunk);
      updateBufferProgress();
      
      // 2. If we are currently stalled waiting for THIS specific block, resume playback
      if (isPlayingRef.current) {
        const currentBlock = queueRef.current[currentIndexRef.current];
        if (currentBlock && currentBlock.id === chunk.blockId) {
          playNext();
        }
      }
    };

    engine.on('audio', onAudio);
    const onEngineError = (payload: { error: unknown }) => {
      const blockId = (payload as { blockId?: string }).blockId;
      const skipped = (payload as { skipped?: boolean }).skipped;
      if (skipped && blockId) {
        if (!skippedBlockIdsRef.current.has(blockId)) {
          skippedBlockIdsRef.current.add(blockId);
          const skippedBlock = queueRef.current.find(block => block.id === blockId);
          if (skippedBlock) {
            onSkip?.(skippedBlock, payload.error);
          }
        }
        updateBufferProgress();

        if (isPlayingRef.current) {
          const currentBlock = queueRef.current[currentIndexRef.current];
          if (currentBlock && currentBlock.id === blockId) {
            currentIndexRef.current++;
            playNext();
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
    // Tiny delay to ensure stop cleanup finishes
    setTimeout(() => {
       setIsPlaying(true);
       isPlayingRef.current = true;
       queueRef.current = blocks;
       currentIndexRef.current = 0;
       bufferedScriptKeyRef.current = bufferKey || null;
       updateBufferProgress(playableBlocks.length);
       
       // 1. Start Generator Pipeline (Sliding Window)
       engineRef.current?.start(blocks, voiceConfigs);
       
       // 2. Start Playback Loop (will likely pause momentarily waiting for block 1)
       playNext();
    }, 10);
  };

  const bufferScript = (blocks: ScriptBlock[]) => {
    const playableBlocks = getPlayableBlocks(blocks);
    stop({ clearBuffer: true });
    queueRef.current = blocks;
    currentIndexRef.current = 0;
    bufferedScriptKeyRef.current = playableBlocks.map(block => block.id).join('|') || null;
    updateBufferProgress(playableBlocks.length);
    engineRef.current?.start(blocks, voiceConfigs);
  };

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
      
      source.connect(ctx.destination);
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
    isPreviewPlaying,
    currentBlockId,
    isLoadingAudio,
    bufferedCount,
    totalBufferedCount,
    isBuffering,
    playScript,
    bufferScript,
    playPreview,
    stop
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
