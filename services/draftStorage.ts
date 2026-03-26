import type { StoryContext } from '../types';
import { isStoryContext } from './storyContext';

export interface DraftPayload {
  context: StoryContext;
  userInstruction: string;
  savedAt: string;
}

export type DraftStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const DRAFT_STORAGE_KEY = 'script-seance:draft:v1';
export const LEGACY_DRAFT_STORAGE_KEYS = ['script-seance:draft:v0', 'script-seance:draft'] as const;

const parseStoredDraft = (rawDraft: string | null): DraftPayload | null => {
  if (!rawDraft) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawDraft) as DraftPayload;
    return parsed && isStoryContext(parsed.context) ? parsed : null;
  } catch {
    return null;
  }
};

export const readStoredDraftPayload = (storage: DraftStorageLike): DraftPayload | null => {
  const currentDraft = parseStoredDraft(storage.getItem(DRAFT_STORAGE_KEY));
  if (currentDraft) {
    return currentDraft;
  }
  if (storage.getItem(DRAFT_STORAGE_KEY)) {
    storage.removeItem(DRAFT_STORAGE_KEY);
  }

  for (const legacyKey of LEGACY_DRAFT_STORAGE_KEYS) {
    const legacyRawDraft = storage.getItem(legacyKey);
    if (!legacyRawDraft) {
      continue;
    }
    const legacyDraft = parseStoredDraft(legacyRawDraft);
    if (!legacyDraft) {
      storage.removeItem(legacyKey);
      continue;
    }
    try {
      storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(legacyDraft));
    } catch {
      // Hydration can still proceed even if the legacy payload cannot be re-saved.
    }
    storage.removeItem(legacyKey);
    return legacyDraft;
  }

  return null;
};
