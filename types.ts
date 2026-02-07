
export enum BlockType {
  HEADING = 'heading',
  ACTION = 'action',
  DIALOGUE = 'dialogue',
  TRANSITION = 'transition'
}

export interface ScriptBlock {
  id: string;
  type: BlockType;
  text: string;
  character?: string;
  parenthetical?: string;
  locked?: boolean;
}

export interface Scene {
  id: string;
  heading: string;
  blocks: ScriptBlock[];
  summary: string;
}

export interface StoryContext {
  title: string;
  genre: string;
  premise: string;
  characters: string[];
  scenes: Scene[];
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

export const LEGACY_VOICE_IDS = [
  'Aoede',
  'Callirrhoe',
  'Kore',
  'Sulafat',
  'Zephyr',
  'Charon',
  'Fenrir',
  'Puck',
  'Rasalgethi',
  'Umbriel'
];

export const AVAILABLE_VOICES = LEGACY_VOICE_IDS;

export const DEFAULT_NARRATOR_VOICE_ID = 'Zephyr';

export interface TtsVoice {
  id: string;
  displayName: string;
  source: 'inworld-premade' | 'inworld-custom' | 'legacy';
  language?: string;
  labels: string[];
  isCustom: boolean;
  gender?: string;
  category?: string;
  description?: string;
}

export type VoiceCatalogState = 'idle' | 'loading' | 'ready' | 'error';

export const GENRES = [
  'Sci-Fi', 'Noir', 'Comedy', 'Horror', 'Romance', 'Fantasy', 'Thriller'
];

export interface PlayerState {
  isPlaying: boolean;
  currentBlockId: string | null;
  isLoadingAudio: boolean;
}
