import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryContext } from '../types';
import {
  DRAFT_STORAGE_KEY,
  DraftPayload,
  readStoredDraftPayload
} from '../services/draftStorage';

interface UseDraftPersistenceParams {
  context: StoryContext | null;
  userInstruction: string;
  debounceMs: number;
  onHydrate: (payload: DraftPayload) => void;
}

export const useDraftPersistence = ({
  context,
  userInstruction,
  debounceMs,
  onHydrate
}: UseDraftPersistenceParams) => {
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const didHydrateDraftRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const autosaveFailureNotifiedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedDraft = readStoredDraftPayload(window.localStorage);
    if (!storedDraft) {
      didHydrateDraftRef.current = true;
      return;
    }
    onHydrate(storedDraft);
    didHydrateDraftRef.current = true;
  }, [onHydrate]);

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
    }, debounceMs);
    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [context, debounceMs, userInstruction]);

  const clearPersistedDraft = useCallback(() => {
    setAutosaveError(null);
    autosaveFailureNotifiedRef.current = false;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear draft', err);
    }
  }, []);

  const clearAutosaveError = useCallback(() => {
    setAutosaveError(null);
    autosaveFailureNotifiedRef.current = false;
  }, []);

  return {
    autosaveError,
    clearAutosaveError,
    clearPersistedDraft
  };
};
