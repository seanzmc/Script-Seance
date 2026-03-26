import { BlockType, Scene } from '../types';

export const buildScriptTextExport = (scenes: Scene[]) => (
  scenes
    .map(scene => {
      const lines: string[] = [];
      const heading = scene.heading.trim();
      if (heading) {
        lines.push(`\n${heading.toUpperCase()}\n`);
      }
      scene.blocks.forEach(block => {
        if (block.type === BlockType.DIALOGUE) {
          const speaker = block.character?.trim().toUpperCase() || 'UNKNOWN';
          lines.push(`\n${speaker}\n`);
          if (block.parenthetical?.trim()) {
            lines.push(`${block.parenthetical.trim()}\n`);
          }
          lines.push(`${block.text}\n`);
          return;
        }
        lines.push(`\n${block.text}\n`);
      });
      return lines.join('');
    })
    .join('\n***\n')
);
