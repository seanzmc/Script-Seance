import { Scene, ScriptBlock } from '../types';

export interface ScriptAnchor {
  kind: 'index';
  index: number;
  id: string;
}

export interface ScriptBlockTarget {
  sceneId: string;
  blockId: string;
}

export interface ScriptBlockPatch {
  text?: string;
}

export interface ScriptController {
  script: Scene[];
  selectedBlockId?: string;
  selectedBlockTarget: ScriptBlockTarget | null;
  activeInsertAnchor?: ScriptAnchor;
  activeRewriteBlockId?: string;

  insertBlock: (anchor: ScriptAnchor, block: ScriptBlock) => void;
  rewriteBlock: (blockId: string, prompt: string) => Promise<void>;
  updateBlock: (blockId: string, patch: ScriptBlockPatch) => void;
  generateNextScene: (anchor?: ScriptAnchor) => Promise<void>;
  openInsert: (anchor: ScriptAnchor) => void;
  openRewrite: (target: ScriptBlockTarget) => void;
  closeComposer: () => void;
}

export const createIndexAnchor = (index: number): ScriptAnchor => ({
  kind: 'index',
  index,
  id: `index:${index}`
});
