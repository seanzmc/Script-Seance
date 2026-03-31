import { describe, expect, it } from 'vitest';
import sharedGenres from '../shared/catalog/genres.json';
import {
  getSceneGenerationLoadingMessages,
  SCENE_GENERATION_LOADING_COPY
} from '../components/workspace/sceneGenerationLoadingCopy';

describe('scene generation loading copy', () => {
  it('provides runtime entries for every canonical genre', () => {
    for (const genre of sharedGenres) {
      expect(
        SCENE_GENERATION_LOADING_COPY.genreSpecific[
          genre as keyof typeof SCENE_GENERATION_LOADING_COPY.genreSpecific
        ]
      ).toBeDefined();
    }
  });

  it('interleaves genre-specific and shared copy deterministically', () => {
    const messages = getSceneGenerationLoadingMessages('Noir');

    expect(messages.slice(0, 7)).toEqual([
      SCENE_GENERATION_LOADING_COPY.genreSpecific.Noir[0],
      SCENE_GENERATION_LOADING_COPY.core[0],
      SCENE_GENERATION_LOADING_COPY.genreSpecific.Noir[1],
      SCENE_GENERATION_LOADING_COPY.messier[0],
      SCENE_GENERATION_LOADING_COPY.genreSpecific.Noir[2],
      SCENE_GENERATION_LOADING_COPY.unhinged[0],
      SCENE_GENERATION_LOADING_COPY.genreSpecific.Noir[3]
    ]);
  });

  it('falls back to shared-only copy when the genre is unknown', () => {
    const messages = getSceneGenerationLoadingMessages('Western');

    expect(messages.slice(0, 6)).toEqual([
      SCENE_GENERATION_LOADING_COPY.core[0],
      SCENE_GENERATION_LOADING_COPY.messier[0],
      SCENE_GENERATION_LOADING_COPY.unhinged[0],
      SCENE_GENERATION_LOADING_COPY.core[1],
      SCENE_GENERATION_LOADING_COPY.messier[1],
      SCENE_GENERATION_LOADING_COPY.unhinged[1]
    ]);
  });

  it('filters blank entries from runtime loading copy arrays', () => {
    const horrorMessages = getSceneGenerationLoadingMessages('Horror');

    expect(SCENE_GENERATION_LOADING_COPY.genreSpecific.Horror).not.toContain('');
    expect(horrorMessages.every((message) => message.length > 0)).toBe(true);
  });
});
