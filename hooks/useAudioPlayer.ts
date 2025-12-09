import { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptBlock, VoiceConfig, BlockType } from '../types';
import { generateSpeech } from '../services/gemini';

interface QueueItem {
  blockId: string;
  audioBuffer: AudioBuffer;
}

// Internal cache for voice previews (maps voiceId:text key to decoded AudioBuffer)
const previewBufferCache = new Map<string, AudioBuffer>();

export const useAudioPlayer = (voiceConfigs: VoiceConfig[]) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Audio Context
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  // State refs for avoiding closure staleness
  const isPlayingRef = useRef(false);
  const voiceConfigsRef = useRef(voiceConfigs);

  // Sync ref with prop
  useEffect(() => {
    voiceConfigsRef.current = voiceConfigs;
  }, [voiceConfigs]);
  
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctx({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const decodePCM = (buffer: ArrayBuffer, ctx: AudioContext): AudioBuffer => {
    const numChannels = 1;
    const sampleRate = 24000;
    const dataInt16 = new Int16Array(buffer);
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

  const playBlock = async (block: ScriptBlock) => {
    if (!isPlayingRef.current) return;

    try {
      setIsLoadingAudio(true);
      
      let config: VoiceConfig | undefined;
      if (block.type === BlockType.DIALOGUE && block.character) {
        const targetChar = block.character.toLowerCase().trim();
        config = voiceConfigsRef.current.find(v => v.name.toLowerCase().trim() === targetChar);
      } else {
        config = voiceConfigsRef.current.find(v => v.name === 'Narrator');
      }

      const voiceId = config?.voiceId || 'Zephyr';
      let textToSay = block.text;

      const audioData = await generateSpeech(textToSay, voiceId);

      if (!isPlayingRef.current) return;

      initAudioContext();
      if (!audioContextRef.current) return;

      const audioBuffer = decodePCM(audioData, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      activeSourceRef.current = source;

      const speed = config?.speed || 1;
      const pitch = config?.pitch || 0; 
      
      source.playbackRate.value = speed;
      source.detune.value = pitch * 100;

      const detuneFactor = Math.pow(2, pitch / 12);
      const effectiveRate = speed * detuneFactor;
      const effectiveDuration = audioBuffer.duration / effectiveRate;

      const currentTime = audioContextRef.current.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }
      
      const startTime = nextStartTimeRef.current;
      source.start(startTime);
      nextStartTimeRef.current = startTime + effectiveDuration;

      const delayMs = (startTime - currentTime) * 1000;
      setTimeout(() => {
        if(isPlayingRef.current) setCurrentBlockId(block.id);
      }, Math.max(0, delayMs));

      return new Promise<void>((resolve) => {
         source.onended = () => {
           activeSourceRef.current = null;
           resolve();
         };
         setTimeout(() => resolve(), (effectiveDuration * 1000) + 200); 
      });

    } catch (e) {
      console.error("Error playing block:", e);
    } finally {
      if (isPlayingRef.current) {
         setIsLoadingAudio(false);
      }
    }
  };

  const playPreview = async (text: string, config: VoiceConfig) => {
    stop(); 
    initAudioContext();
    if (!audioContextRef.current) return;

    const cacheKey = `${config.voiceId}:${text}`;
    let cachedBuffer = previewBufferCache.get(cacheKey);

    try {
      setIsLoadingAudio(!cachedBuffer); // Only show buffering if not in cache

      let audioBuffer: AudioBuffer;

      if (cachedBuffer) {
        audioBuffer = cachedBuffer;
      } else {
        const audioData = await generateSpeech(text, config.voiceId);
        audioBuffer = decodePCM(audioData, audioContextRef.current);
        previewBufferCache.set(cacheKey, audioBuffer);
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.playbackRate.value = config.speed || 1;
      source.detune.value = (config.pitch || 0) * 100;

      activeSourceRef.current = source;
      source.start();
      
      source.onended = () => {
        setIsLoadingAudio(false);
        activeSourceRef.current = null;
      };

    } catch (e) {
      console.error("Preview failed", e);
      setIsLoadingAudio(false);
    }
  };

  const playScript = async (blocks: ScriptBlock[], startFromIndex: number = 0) => {
    stop();
    await new Promise(r => setTimeout(r, 0));

    initAudioContext();
    setIsPlaying(true);
    isPlayingRef.current = true;
    nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;

    for (let i = startFromIndex; i < blocks.length; i++) {
      if (!isPlayingRef.current) break;
      await playBlock(blocks[i]);
    }
    
    if (isPlayingRef.current) {
      setIsPlaying(false);
      setCurrentBlockId(null);
    }
  };

  const stop = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch (e) { }
      activeSourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.suspend();
      nextStartTimeRef.current = 0;
    }
    setCurrentBlockId(null);
    setIsLoadingAudio(false);
  };

  return {
    isPlaying,
    currentBlockId,
    isLoadingAudio,
    playScript,
    playPreview,
    stop
  };
};