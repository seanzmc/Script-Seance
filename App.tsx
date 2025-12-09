import React, { useState, useEffect, useRef } from 'react';
import { SetupForm } from './components/SetupForm';
import { ScriptDisplay } from './components/ScriptDisplay';
import { VoiceManager } from './components/VoiceManager';
import { ScriptEditor } from './components/ScriptEditor';
import { Button } from './components/Button';
import { generateScene, suggestPlotTwist } from './services/gemini';
import { Scene, StoryContext, VoiceConfig, AVAILABLE_VOICES, ScriptBlock, BlockType } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { Play, Pause, Save, PlusCircle, Sparkles, Download, AlertCircle } from 'lucide-react';

export default function App() {
  // State
  const [context, setContext] = useState<StoryContext | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceConfigs, setVoiceConfigs] = useState<VoiceConfig[]>([]);
  const [userInstruction, setUserInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showVoicePanel, setShowVoicePanel] = useState(false);

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Custom Hooks
  const { 
    isPlaying, 
    currentBlockId, 
    isLoadingAudio, 
    playScript, 
    playPreview, 
    stop 
  } = useAudioPlayer(voiceConfigs);

  // Initialize Voices when characters change
  useEffect(() => {
    if (context?.characters) {
      const newConfigs = [...voiceConfigs];
      
      // Ensure Narrator exists
      if (!newConfigs.find(c => c.name === 'Narrator')) {
        newConfigs.push({ name: 'Narrator', voiceId: 'Zephyr', speed: 1, pitch: 0 });
      }

      context.characters.forEach((char, idx) => {
        // Case insensitive check to avoid duplicates if formatting changes
        if (!newConfigs.find(c => c.name.toLowerCase() === char.toLowerCase())) {
          const voice = AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length];
          newConfigs.push({ name: char, voiceId: voice, speed: 1, pitch: 0 });
        }
      });
      setVoiceConfigs(newConfigs);
    }
  }, [context?.characters]);

  // Handlers
  const handleStart = async (data: { genre: string; premise: string; characters: string[] }) => {
    setIsGenerating(true);
    setError(null);
    try {
      const initialContext: StoryContext = { 
        ...data, 
        title: 'Untitled Screenplay',
        scenes: [] 
      };
      const firstScene = await generateScene(initialContext, "Write the opening scene setting the tone.", true);
      
      setContext({
        ...initialContext,
        scenes: [firstScene]
      });
    } catch (e: any) {
      setError(e.message || "Failed to generate story");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateNext = async () => {
    if (!context) return;
    setIsGenerating(true);
    setError(null);
    try {
      const prompt = userInstruction || "Continue the story logically.";
      const nextScene = await generateScene(context, prompt, false);
      setContext(prev => prev ? { ...prev, scenes: [...prev.scenes, nextScene] } : null);
      setUserInstruction('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTwist = async () => {
    if (!context) return;
    setIsGenerating(true);
    try {
      const twist = await suggestPlotTwist(context.genre);
      setUserInstruction(`PLOT TWIST: ${twist}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddBlock = (block: ScriptBlock) => {
    if (!context) return;
    
    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      
      if (block.type === BlockType.HEADING) {
        // Create new scene
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: block.text.toUpperCase(),
          summary: "New user created scene",
          blocks: []
        };
        newScenes.push(newScene);
      } else {
        // Append to last scene
        if (newScenes.length > 0) {
          const lastSceneIndex = newScenes.length - 1;
          const updatedScene = { 
            ...newScenes[lastSceneIndex],
            blocks: [...newScenes[lastSceneIndex].blocks, block]
          };
          newScenes[lastSceneIndex] = updatedScene;
        } else {
          // Edge case: no scenes exist, create one
          newScenes.push({
            id: crypto.randomUUID(),
            heading: "EXT. UNKNOWN - DAY",
            summary: "Start",
            blocks: [block]
          });
        }
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const handleUndo = () => {
    if (!context || context.scenes.length === 0) return;

    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      const lastSceneIndex = newScenes.length - 1;
      const lastScene = { ...newScenes[lastSceneIndex] };

      if (lastScene.blocks.length > 0) {
        // Remove last block
        lastScene.blocks = lastScene.blocks.slice(0, -1);
        newScenes[lastSceneIndex] = lastScene;
      } else {
        // If scene has no blocks (e.g. just a heading was added), remove the scene
        newScenes.pop();
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const updateVoiceConfig = (char: string, updates: Partial<VoiceConfig>) => {
    setVoiceConfigs(prev => {
      const existingIdx = prev.findIndex(c => c.name === char);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...updates };
        return updated;
      }
      return [...prev, { 
        name: char, 
        voiceId: AVAILABLE_VOICES[0], 
        speed: 1, 
        pitch: 0,
        ...updates 
      } as VoiceConfig];
    });
  };

  const handleTitleChange = (newTitle: string) => {
    setContext(prev => prev ? { ...prev, title: newTitle } : null);
  };

  const handlePlay = () => {
    if (!context) return;
    // Flatten all blocks from all scenes
    const allBlocks: ScriptBlock[] = context.scenes.flatMap(s => s.blocks);
    playScript(allBlocks);
  };

  const handleDownload = () => {
    if (!context) return;

    const isUntitled = !context.title.trim() || context.title === 'Untitled Screenplay';
    
    if (isUntitled) {
      const proceed = window.confirm("You haven't given your masterpiece a title yet. Export as \"Untitled Script\"?");
      if (!proceed) {
        titleInputRef.current?.focus();
        return;
      }
    }

    const text = context.scenes.map(s => {
      return s.blocks.map(b => {
        if (b.type === 'heading') return `\n${b.text}\n`;
        if (b.type === 'dialogue') return `\n${b.character?.toUpperCase()}\n${b.parenthetical || ''}\n${b.text}\n`;
        return `\n${b.text}\n`;
      }).join('');
    }).join('\n***\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // requested filename untitled_script if confirmed but generic
    const sanitizedTitle = isUntitled ? 'untitled_script' : context.title.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}.txt`;
    a.click();
  };

  if (!context) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <SetupForm onStart={handleStart} isLoading={isGenerating} />
        {error && (
          <div className="absolute bottom-4 left-0 right-0 text-center text-red-400">
            Error: {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col md:flex-row">
      
      {/* Left Sidebar: Controls */}
      <div className="w-full md:w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-6 overflow-y-auto h-screen sticky top-0">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold text-gray-500 block tracking-widest">Script Title</label>
          <input
            ref={titleInputRef}
            value={context.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Title of your masterpiece..."
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 text-white font-medium outline-none transition-shadow"
          />
          <p className="text-[10px] text-gray-400">{context.genre} • {context.scenes.length} Scenes</p>
        </div>

        {/* Playback */}
        <div className="bg-gray-700/50 p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-200">Playback</span>
            {isLoadingAudio && <span className="text-xs text-indigo-300 animate-pulse">Buffering...</span>}
          </div>
          <div className="flex gap-2">
            {!isPlaying ? (
              <Button onClick={handlePlay} className="flex-1" variant="accent">
                <Play className="w-4 h-4 mr-2" /> Read Script
              </Button>
            ) : (
              <Button onClick={stop} className="flex-1" variant="danger">
                <Pause className="w-4 h-4 mr-2" /> Stop
              </Button>
            )}
          </div>
        </div>

        {/* Script Editor (Granular Control) */}
        <ScriptEditor 
          characters={context.characters}
          genre={context.genre}
          onAddBlock={handleAddBlock}
          onUndo={handleUndo}
          disabled={isPlaying || isGenerating}
        />

        {/* Voice Manager Toggle */}
        <div className="bg-gray-700/50 p-4 rounded-lg">
           <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => setShowVoicePanel(!showVoicePanel)}>
             <span className="text-sm font-medium">Character Voices</span>
             <span className="text-xs text-indigo-400">{showVoicePanel ? 'Hide' : 'Edit'}</span>
           </div>
           {showVoicePanel && (
             <VoiceManager 
               characters={context.characters} 
               voiceConfigs={voiceConfigs} 
               onUpdateConfig={updateVoiceConfig} 
               onPreview={(config) => playPreview("I am a ghost in the machine.", config)}
             />
           )}
        </div>

        {/* Next Scene Generator */}
        <div className="bg-gray-700/50 p-4 rounded-lg flex-1 flex flex-col">
          <label className="text-sm font-medium mb-2 block">What happens next?</label>
          <textarea
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            placeholder="Suggest an action, or leave empty for AI to decide..."
            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm h-32 mb-2 focus:ring-1 focus:ring-indigo-500"
          />
          
          <div className="flex flex-col gap-2 mt-auto">
             <Button onClick={handleTwist} variant="secondary" size="sm" disabled={isGenerating}>
                <Sparkles className="w-3 h-3 mr-2" />
                Add Plot Twist
             </Button>
             <Button onClick={handleGenerateNext} loading={isGenerating} disabled={isPlaying}>
                <PlusCircle className="w-4 h-4 mr-2" />
                Generate Scene {context.scenes.length + 1}
             </Button>
          </div>
        </div>

        {/* Export */}
        <Button variant="ghost" onClick={handleDownload} className="mt-auto">
          <Download className="w-4 h-4 mr-2" /> Export Script
        </Button>
      </div>

      {/* Main Content: Script */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-[#1a1a1a]">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg mb-4 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}
          
          <ScriptDisplay scenes={context.scenes} currentBlockId={currentBlockId} />
          
          {isGenerating && (
            <div className="mt-8 text-center text-gray-400 animate-pulse">
              Running writers room simulation...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}