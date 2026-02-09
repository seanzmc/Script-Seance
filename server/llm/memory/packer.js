import { estimateTokens } from './tokenizer.js';
import { serializeScriptState, compressScriptState } from './script-state.js';

export function packContext(input, config) {
  const { scriptState, allBlocks, instruction, systemPrompt, callbackNotes } = input;
  const budgets = config.generation;

  const systemTokens = estimateTokens(systemPrompt);
  const instructionTokens = estimateTokens(instruction);

  let stateText = serializeScriptState(scriptState);
  let stateTokens = estimateTokens(stateText);
  if (stateTokens > budgets.scriptStateBudget) {
    stateText = compressScriptState(scriptState, budgets.scriptStateBudget);
    stateTokens = estimateTokens(stateText);
  }

  const fixedCost = systemTokens + stateTokens + instructionTokens;
  const blockBudget = Math.max(
    0,
    Math.min(budgets.recentBlocksBudget, budgets.maxInputTokens - fixedCost - 50)
  );

  const { text: blocksText, included, dropped } = packRecentBlocks(allBlocks, blockBudget);
  const blocksTokens = estimateTokens(blocksText);

  let callbackSection = '';
  if (Array.isArray(callbackNotes) && callbackNotes.length > 0) {
    const candidate = `\nCALLBACK NOTES:\n${callbackNotes.map((note) => `- ${note}`).join('\n')}`;
    if (fixedCost + blocksTokens + estimateTokens(candidate) <= budgets.maxInputTokens) {
      callbackSection = candidate;
    }
  }

  const userContent = [
    '=== SCRIPT STATE ===',
    stateText,
    callbackSection,
    blocksText ? `\n=== RECENT SCRIPT ===\n${blocksText}` : '',
    '\n=== INSTRUCTION ===',
    instruction
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const totalEstimatedTokens =
    systemTokens +
    stateTokens +
    blocksTokens +
    instructionTokens +
    estimateTokens(callbackSection);

  return {
    messages,
    metadata: {
      scriptStateTokens: stateTokens,
      recentBlocksTokens: blocksTokens,
      systemTokens,
      instructionTokens,
      totalEstimatedTokens,
      blocksIncluded: included,
      blocksDropped: dropped
    }
  };
}

function packRecentBlocks(blocks, maxTokens) {
  if (!Array.isArray(blocks) || blocks.length === 0 || maxTokens <= 0) {
    return { text: '', included: 0, dropped: Array.isArray(blocks) ? blocks.length : 0 };
  }

  const collected = [];
  let used = 0;
  let included = 0;

  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const line = formatBlock(blocks[i]);
    const cost = estimateTokens(line);
    if (used + cost > maxTokens) {
      break;
    }
    collected.unshift(line);
    used += cost;
    included += 1;
  }

  return {
    text: collected.join('\n'),
    included,
    dropped: blocks.length - included
  };
}

function formatBlock(block) {
  if (!block || typeof block.content !== 'string') {
    return '';
  }

  switch (block.type) {
    case 'scene-heading':
    case 'heading':
      return `\n${block.content.toUpperCase()}\n`;
    case 'transition':
      return `\n${block.content.toUpperCase()}\n`;
    case 'parenthetical':
      return `(${block.content})`;
    default:
      return block.content;
  }
}
