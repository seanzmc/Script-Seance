
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
  voiceId: string; // The Gemini voice name (Puck, Charon, etc.)
  pitch?: number; // Simulated by choosing different voices usually, but placeholders for now
  speed?: number;
}

export const AVAILABLE_VOICES = [
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

export const GENRES = [
  'Sci-Fi', 'Noir', 'Comedy', 'Horror', 'Romance', 'Fantasy', 'Thriller'
];

export interface PlayerState {
  isPlaying: boolean;
  currentBlockId: string | null;
  isLoadingAudio: boolean;
}
