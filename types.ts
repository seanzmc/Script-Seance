
import sharedGenres from './shared/catalog/genres.json';

export enum BlockType {
  HEADING = 'heading',
  ACTION = 'action',
  DIALOGUE = 'dialogue',
  TRANSITION = 'transition'
}

export type ScriptBlockOrigin = 'ai' | 'user' | 'rewrite';

export interface ScriptBlockMeta {
  origin?: ScriptBlockOrigin;
  createdAt?: string;
  opId?: string;
}

export interface ScriptBlock {
  id: string;
  type: BlockType;
  text: string;
  blockRevision: number;
  character?: string;
  parenthetical?: string;
  meta?: ScriptBlockMeta;
}

export interface SceneMeta {
  source?: 'ai' | 'user';
  placeholder?: boolean;
}

export interface Scene {
  id: string;
  heading: string;
  blocks: ScriptBlock[];
  summary: string;
  meta?: SceneMeta;
}

export type SceneLengthOption = 'Short' | 'Medium' | 'Long';

export interface StoryContext {
  title: string;
  genre: string;
  premise: string;
  characters: string[];
  scenes: Scene[];
  style?: string;
  styleId?: string | null;
  targetLength?: SceneLengthOption;
}

export interface VoiceConfig {
  name: string; // The character name in the script
  voiceId: string;
  pitch?: number; // Simulated by choosing different voices usually, but placeholders for now
  speed?: number;
  expressive?: boolean;
}

export const INSERT_TOP_ID = '__insert-top__';
export const INSERT_BOTTOM_ID = '__insert-bottom__';

export type ScriptAnchor =
  | {
      kind: 'block';
      blockId: string;
      position: 'before' | 'after';
      id: string;
    }
  | {
      kind: 'scene';
      sceneId: string;
      position: 'top' | 'bottom';
      id: string;
    }
  | {
      kind: 'index';
      index: number;
      id: string;
    };

export type ScriptSelectionTarget =
  | {
      kind: 'block';
      sceneId: string;
      blockId: string;
    }
  | {
      kind: 'scene-heading';
      sceneId: string;
    };

export interface TtsVoice {
  id: string;
  displayName: string;
  source: 'inworld-premade' | 'inworld-custom';
  language?: string;
  labels: string[];
  tags?: string[];
  isCustom: boolean;
  gender?: string;
  category?: string;
  description?: string;
  autoAssignable?: boolean;
}

export type VoiceCatalogState = 'idle' | 'loading' | 'ready' | 'error';

const loadGenres = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.some((genre) => typeof genre !== 'string')) {
    throw new Error('shared/catalog/genres.json must be an array of strings.');
  }
  return Object.freeze([...value]);
};

export const GENRES: readonly string[] = loadGenres(sharedGenres);

export interface PlayerState {
  isPlaying: boolean;
  currentBlockId: string | null;
  isLoadingAudio: boolean;
}
