import { packContext } from '../memory/packer.js';
import {
  SYSTEM_PROMPT_BASE,
  newScriptStartTemplate,
  continueSceneTemplate,
  insertBlockTemplate,
  regenerateBlockTemplate,
  surpriseMeTemplate,
  surpriseSetupTemplate
} from './templates.js';

export function buildPrompt(input, config) {
  const instruction = instructionForAction(input.action, input.blocks);

  return packContext(
    {
      scriptState: input.scriptState,
      allBlocks: input.blocks,
      instruction,
      systemPrompt: SYSTEM_PROMPT_BASE,
      callbackNotes: input.callbackNotes
    },
    config
  );
}

function instructionForAction(action, blocks) {
  switch (action.type) {
    case 'start':
    case 'new-script':
      return newScriptStartTemplate(action.instruction);

    case 'continue':
      return continueSceneTemplate(action.instruction ?? '');

    case 'insert': {
      const after = blocks.find((block) => block.id === action.insertAfterBlockId);
      const defaultInstruction = `Write a ${action.blockType ?? 'screenplay'} block that fits the local context.`;
      return insertBlockTemplate(
        action.instruction ?? defaultInstruction,
        action.insertAfterContext ?? after?.content ?? '[start of script]'
      );
    }

    case 'regenerate': {
      const target = blocks.find((block) => block.id === action.blockId);
      return regenerateBlockTemplate(
        action.rewriteGuidance ?? action.instruction ?? '',
        action.blockToReplace ?? target?.content ?? ''
      );
    }

    case 'surprise':
    case 'surprise-me':
      return surpriseMeTemplate(action.styleHint ?? '');

    case 'surprise-setup':
      return surpriseSetupTemplate(action.genreHint ?? '');

    default:
      throw new Error(`Unsupported generation action: ${action?.type ?? 'unknown'}`);
  }
}
