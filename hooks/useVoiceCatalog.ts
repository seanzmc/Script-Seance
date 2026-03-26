import { useEffect, useState } from 'react';
import { listVoices } from '../services/ai';
import type { TtsVoice, VoiceCatalogState } from '../types';

export const useVoiceCatalog = (authStatus: 'checking' | 'authenticated' | 'unauthenticated') => {
  const [availableVoices, setAvailableVoices] = useState<TtsVoice[]>([]);
  const [voiceCatalogState, setVoiceCatalogState] = useState<VoiceCatalogState>('idle');

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
    void loadVoiceCatalog();
    return () => {
      isActive = false;
    };
  }, [authStatus]);

  return {
    availableVoices,
    voiceCatalogState
  };
};
