import React, { useEffect, useRef, useState } from 'react';
import { Scene, BlockType } from '../types';
import { Play, Square, ChevronDown, Check, MousePointer2, ScrollText, Zap, SlidersHorizontal, RefreshCw, Lock, Unlock } from 'lucide-react';

interface ScriptDisplayProps {
  scenes: Scene[];
  currentBlockId: string | null;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  showHighlights: boolean;
  onToggleHighlights: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onRegenerate: (sceneId: string, blockId: string) => void;
  onToggleLock: (sceneId: string, blockId: string) => void;
  isRegenerating: boolean;
}

export const ScriptDisplay: React.FC<ScriptDisplayProps> = ({ 
  scenes, 
  currentBlockId, 
  isPlaying, 
  onPlay, 
  onStop,
  playbackSpeed,
  onPlaybackSpeedChange,
  showHighlights,
  onToggleHighlights,
  autoScroll,
  onToggleAutoScroll,
  onRegenerate,
  onToggleLock,
  isRegenerating
}) => {
  const [showSceneMenu, setShowSceneMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && currentBlockId) {
      const el = document.getElementById(`block-${currentBlockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentBlockId, autoScroll]);

  const scrollToScene = (id: string) => {
    const el = document.getElementById(`scene-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setShowSceneMenu(false);
  };

  if (scenes.length === 0) return null;

  const currentScene = scenes.find(s => s.blocks.some(b => b.id === currentBlockId)) || scenes[0];

  return (
    <div className="relative">
      {/* Playback Control Bar */}
      <div className="sticky top-0 z-30 mb-4 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl p-2 px-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          {/* Play/Stop */}
          <button
            onClick={isPlaying ? onStop : onPlay}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
              isPlaying ? 'bg-red-600 text-white shadow-lg shadow-red-900/40' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40'
            }`}
          >
            {isPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <div className="h-6 w-px bg-gray-700 hidden sm:block"></div>

          {/* Scene Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSceneMenu(!showSceneMenu)}
              onBlur={() => setTimeout(() => setShowSceneMenu(false), 200)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-200 transition-colors border border-gray-700"
            >
              <span className="truncate max-w-[120px]">{currentScene?.heading || 'Select Scene'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </button>
            
            {showSceneMenu && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden max-h-64 overflow-y-auto">
                {scenes.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => scrollToScene(s.id)}
                    className="w-full text-left px-4 py-2 text-[11px] font-bold text-gray-400 hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">SC {idx+1}: {s.heading}</span>
                    {currentScene?.id === s.id && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggles */}
          <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-lg border border-gray-700">
            <button
              onClick={onToggleHighlights}
              className={`p-1.5 rounded-md transition-all ${showHighlights ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-700'}`}
              title="Highlight active line"
            >
              <HighlightIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleAutoScroll}
              className={`p-1.5 rounded-md transition-all ${autoScroll ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-700'}`}
              title="Auto-scroll with playback"
            >
              <ScrollText className="w-4 h-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-gray-700 hidden sm:block"></div>

          {/* Speed Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              onBlur={() => setTimeout(() => setShowSpeedMenu(false), 200)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-200 transition-colors border border-gray-700"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>{playbackSpeed.toFixed(1)}x</span>
            </button>
            
            {showSpeedMenu && (
              <div className="absolute top-full right-0 mt-2 w-28 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                {[0.5, 0.8, 1.0, 1.2, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      onPlaybackSpeedChange(speed);
                      setShowSpeedMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-[11px] font-bold text-gray-400 hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-between"
                  >
                    <span>{speed.toFixed(1)}x</span>
                    {playbackSpeed === speed && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="font-screenplay bg-[#f0f0f0] text-black p-8 md:p-16 min-h-[600px] shadow-2xl max-w-4xl mx-auto rounded-sm relative overflow-hidden">
        {/* Paper texture/look */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03] bg-repeat bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>
        
        <div className="relative z-10 space-y-6">
          {scenes.map((scene, sceneIndex) => (
            <div key={scene.id} id={`scene-${scene.id}`} className="mb-8">
              <div className="font-bold uppercase mb-4 text-lg border-b border-gray-300 pb-2">
                {scene.heading}
              </div>
              
              <div className="space-y-4">
                {scene.blocks.map((block) => {
                  const isActive = block.id === currentBlockId;
                  const highlightClass = (showHighlights && isActive) 
                    ? "bg-yellow-200 transition-colors duration-300 shadow-sm -mx-2 px-2 py-1 rounded ring-1 ring-yellow-400/30" 
                    : "transition-colors duration-300";

                  if (block.type === BlockType.HEADING) {
                    return null; 
                  }

                  let content = null;
                  
                  if (block.type === BlockType.ACTION) {
                    content = (
                      <div className={`mb-4 leading-relaxed`}>
                        {block.text}
                      </div>
                    );
                  } else if (block.type === BlockType.DIALOGUE) {
                    content = (
                      <div className={`max-w-md mx-auto text-center`}>
                        <div className="uppercase mt-4 mb-0 font-bold tracking-wider">{block.character}</div>
                        {block.parenthetical && (
                          <div className="text-sm italic lowercase mb-0">{block.parenthetical}</div>
                        )}
                        <div className="mt-0 mb-4 whitespace-pre-wrap">
                          {block.text}
                        </div>
                      </div>
                    );
                  } else if (block.type === BlockType.TRANSITION) {
                    content = (
                      <div className={`text-right uppercase font-bold pr-4`}>
                        {block.text}
                      </div>
                    );
                  }

                  if (!content) return null;

                  return (
                    <div 
                      key={block.id} 
                      id={`block-${block.id}`}
                      className={`group relative ${highlightClass}`}
                    >
                      {/* Hover Actions */}
                      <div className="absolute -right-12 top-0 bottom-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                         {!block.locked && (
                           <button 
                             onClick={(e) => { e.stopPropagation(); onRegenerate(scene.id, block.id); }}
                             disabled={isRegenerating}
                             className="p-1.5 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-indigo-600 shadow-sm hover:shadow transition-all"
                             title="Regenerate this block with AI"
                           >
                             <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                           </button>
                         )}
                         <button 
                           onClick={(e) => { e.stopPropagation(); onToggleLock(scene.id, block.id); }}
                           className={`p-1.5 border rounded-full shadow-sm hover:shadow transition-all ${block.locked ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'}`}
                           title={block.locked ? "Unlock block" : "Lock block (prevents changes)"}
                         >
                           {block.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                         </button>
                      </div>

                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const HighlightIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
);
