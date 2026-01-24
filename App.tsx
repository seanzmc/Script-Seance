import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SetupForm } from './components/SetupForm';
import { ScriptDisplay } from './components/ScriptDisplay';
import { VoiceManager } from './components/VoiceManager';
import { InsertBlock } from './components/InsertBlock';
import { Button } from './components/Button';
import { VoiceCastingModal } from './components/VoiceCastingModal';
import { LoginModal } from './components/LoginModal';
import { PrivacyModal } from './components/PrivacyModal';
import {
  createGenerateSceneRequest,
  createSuggestPlotTwistRequest,
  createRegenerateScriptBlockRequest,
  CancellableRequest
} from './services/gemini';
import { getSession, login } from './services/auth';
import { Scene, StoryContext, VoiceConfig, AVAILABLE_VOICES, ScriptBlock, BlockType } from './types';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { Play, Pause, PlusCircle, Sparkles, Download, AlertCircle, PenTool, Mic2, PlayCircle, Loader2, ScrollText, RotateCcw } from 'lucide-react';

type TabType = 'write' | 'cast' | 'play';

interface ToastState {
  message: string;
  onUndo?: () => void;
}

interface DraftPayload {
  context: StoryContext;
  userInstruction: string;
  savedAt: string;
}

const DRAFT_STORAGE_KEY = 'script-seance:draft:v1';
const DRAFT_DEBOUNCE_MS = 800;

const isStoryContext = (value: unknown): value is StoryContext => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.genre === 'string' &&
    typeof record.premise === 'string' &&
    Array.isArray(record.characters) &&
    Array.isArray(record.scenes)
  );
};

const getErrorMeta = (err: unknown) => {
  if (!err || typeof err !== 'object') {
    return { code: undefined, status: undefined, message: undefined };
  }
  const record = err as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  const message = typeof record.message === 'string' ? record.message : undefined;
  return { code, status, message };
};

export default function App() {
  // State
  const [context, setContext] = useState<StoryContext | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceConfigs, setVoiceConfigs] = useState<VoiceConfig[]>([]);
  const [userInstruction, setUserInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('write');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const activeAiRequestRef = useRef<CancellableRequest<unknown> | null>(null);
  
  // Playback Settings
  const [showHighlights, setShowHighlights] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Casting Modal State
  const [castingCharacter, setCastingCharacter] = useState<string | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const didHydrateDraftRef = useRef(false);
  const lastNonPrivacyPathRef = useRef('/');

  const handleAiError = useCallback((err: unknown, fallbackMessage: string) => {
    const { code, status, message } = getErrorMeta(err);
    if (code === 'REQUEST_ABORTED') {
      setError(null);
      return true;
    }
    if (code === 'REQUEST_TIMEOUT' || code === 'UPSTREAM_TIMEOUT') {
      setError('Request timed out. Please try again.');
      return true;
    }
    if (status === 401) {
      setAuthStatus('unauthenticated');
      setAuthError('Session expired. Please log in again.');
      setError('Authentication required. Please log in to continue.');
      return true;
    }
    if (status === 429) {
      setError('Rate limit exceeded. Please wait and try again.');
      return true;
    }
    setError(message || fallbackMessage);
    return false;
  }, []);

  const handleAudioSkip = useCallback((block: ScriptBlock) => {
    const rawText = block.text.trim();
    const snippet = rawText.length > 60 ? `${rawText.slice(0, 57)}...` : rawText;
    const label = block.type === BlockType.DIALOGUE
      ? (block.character ? block.character : 'Dialogue')
      : block.type === BlockType.ACTION
        ? 'Action'
        : 'Transition';
    const detail = snippet ? `: "${snippet}"` : '';
    setToast({ message: `Skipped audio for ${label}${detail}` });
  }, []);

  const startAiRequest = <T,>(request: CancellableRequest<T>) => {
    if (activeAiRequestRef.current) {
      activeAiRequestRef.current.cancel();
    }
    activeAiRequestRef.current = request as CancellableRequest<unknown>;
    setIsGenerating(true);
    setError(null);
  };

  const finishAiRequest = <T,>(request: CancellableRequest<T>) => {
    if (activeAiRequestRef.current === request) {
      activeAiRequestRef.current = null;
      setIsGenerating(false);
    }
  };

  const cancelAiRequest = () => {
    if (activeAiRequestRef.current) {
      activeAiRequestRef.current.cancel();
      activeAiRequestRef.current = null;
    }
    setIsGenerating(false);
    setError(null);
  };

  const openPrivacy = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/privacy') {
      lastNonPrivacyPathRef.current = window.location.pathname || '/';
      window.history.pushState({}, '', '/privacy');
    }
    setIsPrivacyOpen(true);
  };

  const closePrivacy = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/privacy') {
      const targetPath = lastNonPrivacyPathRef.current || '/';
      window.history.pushState({}, '', targetPath);
    }
    setIsPrivacyOpen(false);
  };

  // Custom Hooks
  const { 
    isPlaying,
    isPreviewPlaying, 
    currentBlockId, 
    isLoadingAudio, 
    playScript, 
    playPreview, 
    stop 
  } = useAudioPlayer(voiceConfigs, handleAiError, handleAudioSkip);

  // Clear preview state when playback ends
  useEffect(() => {
    if (!isPreviewPlaying && !isLoadingAudio) {
      setPreviewVoiceId(null);
    }
  }, [isPreviewPlaying, isLoadingAudio]);

  // Toast Auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Initialize Voices when characters change
  useEffect(() => {
    if (context?.characters) {
      const newConfigs = [...voiceConfigs];
      
      // Ensure Narrator exists
      if (!newConfigs.find(c => c.name === 'Narrator')) {
        newConfigs.push({ name: 'Narrator', voiceId: 'Zephyr', speed: playbackSpeed, pitch: 0 });
      }

      context.characters.forEach((char, idx) => {
        if (!newConfigs.find(c => c.name.toLowerCase() === char.toLowerCase())) {
          const voice = AVAILABLE_VOICES[idx % AVAILABLE_VOICES.length];
          newConfigs.push({ name: char, voiceId: voice, speed: playbackSpeed, pitch: 0 });
        }
      });
      setVoiceConfigs(newConfigs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.characters]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        await getSession();
        if (active) {
          setAuthStatus('authenticated');
          setAuthError(null);
        }
      } catch {
        if (active) {
          setAuthStatus('unauthenticated');
        }
      }
    };
    checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentPath = window.location.pathname;
    lastNonPrivacyPathRef.current = currentPath === '/privacy' ? '/' : currentPath;
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path !== '/privacy') {
        lastNonPrivacyPathRef.current = path || '/';
      }
      setIsPrivacyOpen(path === '/privacy');
    };
    setIsPrivacyOpen(currentPath === '/privacy');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!storedDraft) {
      didHydrateDraftRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(storedDraft) as DraftPayload;
      if (parsed && isStoryContext(parsed.context)) {
        setContext(parsed.context);
        if (typeof parsed.userInstruction === 'string') {
          setUserInstruction(parsed.userInstruction);
        }
      } else {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      didHydrateDraftRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!context || !didHydrateDraftRef.current || typeof window === 'undefined') return;
    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      const payload: DraftPayload = {
        context,
        userInstruction,
        savedAt: new Date().toISOString()
      };
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to save draft', err);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [context, userInstruction]);

  const handleLogin = async (password: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await login(password);
      setAuthStatus('authenticated');
      setError(null);
    } catch (err: unknown) {
      const { status, message } = getErrorMeta(err);
      if (status === 401) {
        setAuthError('Incorrect password.');
      } else {
        setAuthError(message || 'Login failed.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleClearDraft = () => {
    if (!context) return;
    const proceed = window.confirm('Clear the saved draft from this browser?');
    if (!proceed) return;
    cancelAiRequest();
    stop();
    setContext(null);
    setUserInstruction('');
    setVoiceConfigs([]);
    setActiveTab('write');
    setError(null);
    setToast(null);
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear draft', err);
    }
  };

  // Handlers
  const handleStart = async (data: { genre: string; premise: string; characters: string[] }) => {
    if (isGenerating) return;
    let request: CancellableRequest<Scene> | null = null;
    try {
      const initialContext: StoryContext = { 
        ...data, 
        title: 'Untitled Screenplay',
        scenes: [] 
      };
      request = createGenerateSceneRequest(
        initialContext,
        "Write the opening scene setting the tone.",
        true
      );
      startAiRequest(request);
      const firstScene = await request.promise;
      
      setContext({
        ...initialContext,
        scenes: [firstScene]
      });
    } catch (err: unknown) {
      handleAiError(err, "Failed to generate story");
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleGenerateNext = async () => {
    if (!context || isGenerating) return;
    let request: CancellableRequest<Scene> | null = null;
    try {
      const prompt = userInstruction || "Continue the story logically.";
      request = createGenerateSceneRequest(context, prompt, false);
      startAiRequest(request);
      const nextScene = await request.promise;
      setContext(prev => prev ? { ...prev, scenes: [...prev.scenes, nextScene] } : null);
      setUserInstruction('');
    } catch (err: unknown) {
      handleAiError(err, 'Failed to generate scene.');
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleTwist = async () => {
    if (!context || isGenerating) return;
    let request: CancellableRequest<string> | null = null;
    try {
      request = createSuggestPlotTwistRequest(context.genre);
      startAiRequest(request);
      const twist = await request.promise;
      setUserInstruction(`PLOT TWIST: ${twist}`);
    } catch (err: unknown) {
      console.error(err);
      handleAiError(err, 'Failed to generate plot twist.');
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
  };

  const handleAddBlock = (block: ScriptBlock) => {
    if (!context) return;
    
    setContext(prev => {
      if (!prev) return null;
      const newScenes = [...prev.scenes];
      
      if (block.type === BlockType.HEADING) {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          heading: block.text.toUpperCase(),
          summary: "New user created scene",
          blocks: []
        };
        newScenes.push(newScene);
      } else {
        if (newScenes.length > 0) {
          const lastSceneIndex = newScenes.length - 1;
          const updatedScene = { 
            ...newScenes[lastSceneIndex],
            blocks: [...newScenes[lastSceneIndex].blocks, block]
          };
          newScenes[lastSceneIndex] = updatedScene;
        } else {
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
        lastScene.blocks = lastScene.blocks.slice(0, -1);
        newScenes[lastSceneIndex] = lastScene;
      } else {
        newScenes.pop();
      }
      return { ...prev, scenes: newScenes };
    });
  };

  const handleToggleLock = (sceneId: string, blockId: string) => {
    if (!context) return;
    setContext(prev => {
      if (!prev) return null;
      const newScenes = prev.scenes.map(scene => {
        if (scene.id !== sceneId) return scene;
        return {
          ...scene,
          blocks: scene.blocks.map(b => b.id === blockId ? { ...b, locked: !b.locked } : b)
        };
      });
      return { ...prev, scenes: newScenes };
    });
  };

  const handleRegenerateBlock = async (sceneId: string, blockId: string) => {
    if (!context || isGenerating) return;

    const scene = context.scenes.find(s => s.id === sceneId);
    const block = scene?.blocks.find(b => b.id === blockId);

    if (!block || block.locked) return;

    const originalText = block.text;

    let request: CancellableRequest<string> | null = null;
    try {
      request = createRegenerateScriptBlockRequest(block, context.genre, context.premise);
      startAiRequest(request);
      const newText = await request.promise;
      
      // Update state
      setContext(prev => {
        if (!prev) return null;
        return {
          ...prev,
          scenes: prev.scenes.map(s => s.id === sceneId ? {
            ...s,
            blocks: s.blocks.map(b => b.id === blockId ? { ...b, text: newText } : b)
          } : s)
        };
      });

      // Show toast with undo
      setToast({
        message: 'Block regenerated',
        onUndo: () => {
          setContext(prev => {
            if (!prev) return null;
            return {
              ...prev,
              scenes: prev.scenes.map(s => s.id === sceneId ? {
                ...s,
                blocks: s.blocks.map(b => b.id === blockId ? { ...b, text: originalText } : b)
              } : s)
            };
          });
          setToast(null);
        }
      });

    } catch (err: unknown) {
      console.error(err);
      handleAiError(err, "Failed to regenerate block.");
    } finally {
      if (request) {
        finishAiRequest(request);
      }
    }
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
        speed: playbackSpeed, 
        pitch: 0,
        ...updates 
      } as VoiceConfig];
    });
  };

  const handleGlobalSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setVoiceConfigs(prev => prev.map(config => ({ ...config, speed })));
  };

  const handleTitleChange = (newTitle: string) => {
    setContext(prev => prev ? { ...prev, title: newTitle } : null);
  };

  const handlePlay = () => {
    if (!context) return;
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
    
    const sanitizedTitle = isUntitled ? 'untitled_script' : context.title.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}.txt`;
    a.click();
  };

  const getPreviewText = (charName: string): string => {
    if (!context) return "I am a ghost in the machine.";
    for (const scene of context.scenes) {
      for (const block of scene.blocks) {
        if (block.type === BlockType.DIALOGUE && 
            block.character?.toLowerCase().trim() === charName.toLowerCase().trim()) {
          return block.text || "I am speechless.";
        }
      }
    }
    return `I am ${charName}, ready for my closeup.`;
  };

  const handleModalPreview = async (voiceId: string) => {
    if (!castingCharacter) return;
    
    if (isPreviewPlaying && previewVoiceId === voiceId) {
      stop();
      return;
    }
    
    stop();
    
    setPreviewVoiceId(voiceId);
    const text = getPreviewText(castingCharacter);
    const config: VoiceConfig = { 
      name: castingCharacter, 
      voiceId, 
      speed: playbackSpeed, 
      pitch: 0 
    };
    await playPreview(text, config);
  };

  const privacyModal = (
    <PrivacyModal isOpen={isPrivacyOpen} onClose={closePrivacy} />
  );

  if (!context) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <SetupForm onStart={handleStart} isLoading={isGenerating} onError={handleAiError} />
        {error && (
          <div className="absolute bottom-4 left-0 right-0 text-center text-red-400">
            Error: {error}
          </div>
        )}
        {isGenerating && (
          <div className="absolute top-4 right-4">
            <Button variant="ghost" size="sm" onClick={cancelAiRequest}>
              Cancel
            </Button>
          </div>
        )}
        <LoginModal
          isOpen={authStatus === 'unauthenticated'}
          isLoading={isAuthLoading}
          error={authError}
          onLogin={handleLogin}
        />
        {privacyModal}
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col xl:flex-row overflow-hidden relative">
      
      {/* Sidebar Controls */}
      <div className="
        w-full 
        xl:w-[380px] xl:min-w-[340px] xl:max-w-[420px]
        h-[45vh] xl:h-full
        bg-gray-800 border-b xl:border-b-0 xl:border-r border-gray-700 
        flex flex-col 
        z-40 shrink-0 
        shadow-2xl xl:shadow-none
      ">
        
        {/* Title Section */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/50 shrink-0">
          <label className="text-[10px] uppercase font-bold text-gray-500 block tracking-widest mb-2">Script Title</label>
          <input
            ref={titleInputRef}
            value={context.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Title of your masterpiece..."
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 text-white font-medium outline-none transition-shadow"
          />
          <p className="text-[10px] text-gray-400 mt-1">{context.genre} • {context.scenes.length} Scenes</p>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
            <span>Draft autosaves locally.</span>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300"
            >
              Clear draft
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-700 bg-gray-900/20 shrink-0">
          {(['write', 'cast', 'play'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-2 text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1 transition-all border-b-2 ${
                activeTab === tab 
                  ? 'border-indigo-500 !text-white bg-indigo-500/5' 
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab === 'write' && <PenTool className="w-4 h-4" />}
              {tab === 'cast' && <Mic2 className="w-4 h-4" />}
              {tab === 'play' && <PlayCircle className="w-4 h-4" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth custom-scrollbar">
          
          {/* WRITE TAB */}
          {activeTab === 'write' && (
            <div className="flex flex-col gap-10 animate-in fade-in duration-300">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">What happens next?</h3>
                  <div className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">Scene {context.scenes.length + 1}</div>
                </div>
                <textarea
                  value={userInstruction}
                  onChange={(e) => setUserInstruction(e.target.value)}
                  placeholder="Suggest an action, or leave empty for AI to decide..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm h-32 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-gray-600 shadow-inner"
                />
                <p className="text-[11px] text-gray-500">
                  Prompts are sent to a third-party AI service. Avoid sensitive data.{' '}
                  <button
                    type="button"
                    onClick={openPrivacy}
                    className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                  >
                    Privacy
                  </button>
                </p>
                
                <div className="grid grid-cols-2 gap-2">
                   <Button onClick={handleTwist} variant="secondary" size="sm" disabled={isGenerating}>
                      <Sparkles className="w-3 h-3 mr-2" />
                      Plot Twist
                   </Button>
                   <Button onClick={handleGenerateNext} loading={isGenerating} disabled={isPlaying} className="shadow-lg shadow-indigo-500/20">
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Generate
                   </Button>
                </div>
              </section>

              <div className="border-t border-gray-700 pt-8">
                <InsertBlock 
                  characters={context.characters}
                  genre={context.genre}
                  onAddBlock={handleAddBlock}
                  onUndo={handleUndo}
                  onError={(err) => handleAiError(err, 'Failed to generate block.')}
                  disabled={isPlaying || isGenerating}
                />
              </div>
            </div>
          )}

          {/* CAST TAB */}
          {activeTab === 'cast' && (
            <div className="animate-in fade-in duration-300">
               <VoiceManager 
                 characters={context.characters} 
                 voiceConfigs={voiceConfigs} 
                 onUpdateConfig={updateVoiceConfig}
                 onOpenCasting={setCastingCharacter}
                 onPreview={(config) => playPreview(getPreviewText(config.name), config)}
                 onStop={stop}
                 isAudioPlaying={isPreviewPlaying && !castingCharacter} 
                 isLoading={isLoadingAudio && !isPlaying && !castingCharacter} 
                 globalSpeed={playbackSpeed}
                 onGlobalSpeedChange={handleGlobalSpeedChange}
               />
            </div>
          )}

          {/* PLAY TAB */}
          {activeTab === 'play' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Script Performance</h3>
                <div className="bg-gray-700/30 p-6 rounded-xl border border-gray-700 flex flex-col items-center justify-center text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isPlaying ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'}`}>
                    {isPlaying ? <Pause className="w-8 h-8 text-white fill-current" /> : <Play className="w-8 h-8 text-white fill-current ml-1" />}
                  </div>
                  
                  <div className="space-y-1">
                    <p className="font-bold text-white text-base">{isPlaying ? 'Reading Script...' : 'Ready to Perform'}</p>
                    <p className="text-xs text-gray-400">Current scene count: {context.scenes.length}</p>
                  </div>

                  <div className="w-full pt-2">
                    {!isPlaying ? (
                      <Button onClick={handlePlay} className="w-full" variant="accent" size="lg">
                        <Play className="w-4 h-4 mr-2" /> Start Reading
                      </Button>
                    ) : (
                      <Button onClick={stop} className="w-full" variant="danger" size="lg">
                        <Pause className="w-4 h-4 mr-2" /> Stop Playback
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-3 bg-gray-900/30 p-4 rounded-lg border border-gray-800">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Quick Settings</h3>
                <div className="flex items-center justify-between group cursor-pointer" onClick={() => setAutoScroll(!autoScroll)}>
                  <div className="flex items-center gap-2">
                    <ScrollText className={`w-3.5 h-3.5 ${autoScroll ? 'text-indigo-400' : 'text-gray-500'}`} />
                    <span className="text-xs text-gray-300">Auto-scroll script</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${autoScroll ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${autoScroll ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                </div>
                <div className="flex items-center justify-between group cursor-pointer" onClick={() => setShowHighlights(!showHighlights)}>
                  <div className="flex items-center gap-2">
                    <HighlightingIcon className={`w-3.5 h-3.5 ${showHighlights ? 'text-indigo-400' : 'text-gray-500'}`} />
                    <span className="text-xs text-gray-300">Highlight active line</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${showHighlights ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${showHighlights ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                </div>
              </section>
            </div>
          )}

        </div>

        {/* Export Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/80 mt-auto shrink-0">
          <Button variant="ghost" onClick={handleDownload} className="w-full text-xs py-2 h-auto hover:bg-gray-700">
            <Download className="w-3 h-3 mr-2" /> Export Script (.txt)
          </Button>
        </div>
      </div>

      {/* Main Content: Script */}
      <div className="
        flex-1 
        bg-[#1a1a1a] 
        relative 
        overflow-y-auto 
        overflow-x-hidden
        h-[55vh] xl:h-full
      ">
        <div className="min-h-full p-4 md:p-8 xl:p-12 flex flex-col">
          <div className="w-full xl:min-w-[720px] max-w-5xl mx-auto flex-1 transition-all duration-300">
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg mb-4 flex items-center animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 mr-2" />
                {error}
              </div>
            )}
            
            <ScriptDisplay 
              scenes={context.scenes} 
              currentBlockId={currentBlockId} 
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onStop={stop}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={handleGlobalSpeedChange}
              showHighlights={showHighlights}
              onToggleHighlights={() => setShowHighlights(!showHighlights)}
              autoScroll={autoScroll}
              onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
              onRegenerate={handleRegenerateBlock}
              onToggleLock={handleToggleLock}
              isRegenerating={isGenerating}
            />
            
            {isGenerating && (
              <div className="mt-8 text-center text-gray-400 animate-pulse flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">Running writers room simulation...</span>
                <Button variant="ghost" size="sm" onClick={cancelAiRequest}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Toast Notification */}
        {toast && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 fade-in z-50">
            <span className="text-sm font-medium">{toast.message}</span>
            {toast.onUndo && (
              <button 
                onClick={toast.onUndo}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 px-2 py-1 rounded flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Voice Casting Modal */}
      {castingCharacter && (
        <VoiceCastingModal 
          isOpen={true}
          onClose={() => {
            stop(); 
            setCastingCharacter(null);
          }}
          characterName={castingCharacter}
          currentVoiceId={voiceConfigs.find(c => c.name === castingCharacter)?.voiceId || AVAILABLE_VOICES[0]}
          voiceConfigs={voiceConfigs}
          onSelect={(voiceId) => {
             updateVoiceConfig(castingCharacter, { voiceId });
             stop();
             setCastingCharacter(null);
          }}
          onPreview={handleModalPreview}
          isPreviewing={isPreviewPlaying || isLoadingAudio}
          previewVoiceId={previewVoiceId}
        />
      )}

      <LoginModal
        isOpen={authStatus === 'unauthenticated'}
        isLoading={isAuthLoading}
        error={authError}
        onLogin={handleLogin}
      />
      {privacyModal}
    </div>
  );
}

const HighlightingIcon = ({ className }: { className?: string }) => (
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
