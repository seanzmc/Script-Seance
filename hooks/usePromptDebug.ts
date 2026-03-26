import { useCallback, useEffect, useState } from 'react';
import {
  PROMPT_DEBUG_EVENT_NAME,
  type PromptDebugTrace
} from '../services/ai';

type DebugWindow = Window & {
  __SS_DEBUG_PROMPTS__?: boolean;
  __SS_PROMPT_CONTEXT_REVISION__?: number;
  __SS_STYLE_FINGERPRINT__?: string;
};

interface UsePromptDebugParams {
  promptContextRevision: number;
  promptStyleFingerprint: string;
}

export const usePromptDebug = ({
  promptContextRevision,
  promptStyleFingerprint
}: UsePromptDebugParams) => {
  const [isPromptDebugEnabled, setIsPromptDebugEnabled] = useState(false);
  const [promptDebugTraces, setPromptDebugTraces] = useState<PromptDebugTrace[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!import.meta.env.DEV) return;
    const debugWindow = window as DebugWindow;
    setIsPromptDebugEnabled(Boolean(debugWindow.__SS_DEBUG_PROMPTS__));
    debugWindow.__SS_PROMPT_CONTEXT_REVISION__ = promptContextRevision;
    debugWindow.__SS_STYLE_FINGERPRINT__ = promptStyleFingerprint;
  }, [promptContextRevision, promptStyleFingerprint]);

  useEffect(() => {
    if (!isPromptDebugEnabled || typeof window === 'undefined') return;
    const handlePromptDebugTrace = (event: Event) => {
      const detail = (event as CustomEvent<PromptDebugTrace>).detail;
      if (!detail) return;
      setPromptDebugTraces((previous) => [detail, ...previous].slice(0, 30));
    };
    window.addEventListener(PROMPT_DEBUG_EVENT_NAME, handlePromptDebugTrace as EventListener);
    return () => {
      window.removeEventListener(PROMPT_DEBUG_EVENT_NAME, handlePromptDebugTrace as EventListener);
    };
  }, [isPromptDebugEnabled]);

  const clearPromptDebugTraces = useCallback(() => {
    setPromptDebugTraces([]);
  }, []);

  return {
    isPromptDebugEnabled,
    promptDebugTraces,
    clearPromptDebugTraces
  };
};
