import React, { useEffect, useRef } from 'react';
import { Scene, BlockType } from '../types';

interface ScriptDisplayProps {
  scenes: Scene[];
  currentBlockId: string | null;
}

export const ScriptDisplay: React.FC<ScriptDisplayProps> = ({ scenes, currentBlockId }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of new content, or to active block
  useEffect(() => {
    if (currentBlockId) {
      const el = document.getElementById(`block-${currentBlockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (scenes.length > 0) {
      // If simply adding new scenes, scroll to bottom if we aren't playing
      // Note: This logic might conflict if user is reading up top. 
      // For now, let's stick to active block scrolling.
    }
  }, [currentBlockId, scenes.length]);

  if (scenes.length === 0) return null;

  return (
    <div className="font-screenplay bg-[#f0f0f0] text-black p-8 md:p-16 min-h-[600px] shadow-lg max-w-4xl mx-auto rounded-sm relative overflow-hidden">
      {/* Paper texture/look */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03] bg-repeat bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>
      
      <div className="relative z-10 space-y-6">
        {scenes.map((scene, sceneIndex) => (
          <div key={scene.id} className="mb-8">
            <div className="font-bold uppercase mb-4 text-lg border-b border-gray-300 pb-2">
              {scene.heading}
            </div>
            
            <div className="space-y-4">
              {scene.blocks.map((block) => {
                const isActive = block.id === currentBlockId;
                const highlightClass = isActive ? "bg-yellow-200 transition-colors duration-300 shadow-sm -mx-2 px-2 py-1 rounded" : "transition-colors duration-300";

                if (block.type === BlockType.HEADING) {
                   return null; // Headings handled at scene level for simplicity, or could render if inside blocks
                }
                
                if (block.type === BlockType.ACTION) {
                  return (
                    <div id={`block-${block.id}`} key={block.id} className={`${highlightClass} mb-4 leading-relaxed`}>
                      {block.text}
                    </div>
                  );
                }

                if (block.type === BlockType.DIALOGUE) {
                  return (
                    <div id={`block-${block.id}`} key={block.id} className={`max-w-md mx-auto text-center ${highlightClass}`}>
                      <div className="uppercase mt-4 mb-0 font-bold tracking-wider">{block.character}</div>
                      {block.parenthetical && (
                        <div className="text-sm italic lowercase mb-0">{block.parenthetical}</div>
                      )}
                      <div className="mt-0 mb-4">
                        {block.text}
                      </div>
                    </div>
                  );
                }
                
                if (block.type === BlockType.TRANSITION) {
                   return (
                    <div id={`block-${block.id}`} key={block.id} className={`text-right uppercase font-bold pr-4 ${highlightClass}`}>
                      {block.text}
                    </div>
                   );
                }

                return null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};