import React, { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useStoryWorkspace } from '../hooks/useStoryWorkspace';
import { BlockType, Scene, StoryContext } from '../types';
import { createScriptMutationController } from '../services/scriptController';
import { GenerationOrchestrator } from '../services/orchestration';

const executeGenerateSceneMock = vi.fn();
const stableAudioPlayerState = {
  isPlaying: false,
  isPaused: false,
  isPreviewPlaying: false,
  currentBlockId: null,
  currentBlockIndex: -1,
  isLoadingAudio: false,
  bufferedCount: 0,
  totalBufferedCount: 0,
  blockStatuses: {},
  playScript: vi.fn(),
  clearGeneratedAudio: vi.fn(),
  playPreview: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  goToNext: vi.fn(),
  goToPrevious: vi.fn(),
  retryCurrentBlock: vi.fn(),
  skipCurrentBlock: vi.fn()
};
const stableAuthState = {
  authStatus: 'authenticated',
  authError: null,
  isAuthLoading: false,
  handleLogin: vi.fn(),
  requireAuthentication: vi.fn()
};
const stableDraftPersistenceState = {
  autosaveError: null,
  clearAutosaveError: vi.fn(),
  clearPersistedDraft: vi.fn()
};
const stablePrivacyState = {
  isPrivacyOpen: false,
  openPrivacy: vi.fn(),
  closePrivacy: vi.fn()
};
const stablePromptDebugState = {
  isPromptDebugEnabled: false,
  promptDebugTraces: [],
  clearPromptDebugTraces: vi.fn()
};
const stableVoiceCatalogState = {
  availableVoices: [],
  voiceCatalogState: 'ready'
};

vi.mock('../services/ai', async () => {
  const actual = await vi.importActual<typeof import('../services/ai')>('../services/ai');
  return {
    ...actual,
    executeGenerateScene: (...args: Parameters<typeof actual.executeGenerateScene>) => (
      executeGenerateSceneMock(...args)
    )
  };
});

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => stableAudioPlayerState
}));

vi.mock('../hooks/useAuthSession', () => ({
  useAuthSession: () => stableAuthState
}));

vi.mock('../hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => stableDraftPersistenceState
}));

vi.mock('../hooks/usePrivacyRoute', () => ({
  usePrivacyRoute: () => stablePrivacyState
}));

vi.mock('../hooks/usePromptDebug', () => ({
  usePromptDebug: () => stablePromptDebugState
}));

vi.mock('../hooks/useVoiceCatalog', () => ({
  useVoiceCatalog: () => stableVoiceCatalogState
}));

const openingScene: Scene = {
  id: 'scene-opening',
  heading: 'INT. ARCHIVE - NIGHT',
  summary: 'The first beat arrives.',
  blocks: [
    {
      id: 'block-opening-1',
      type: BlockType.ACTION,
      text: 'Dust hangs in the beam of a flashlight.',
      blockRevision: 1
    }
  ]
};

const nextScene: Scene = {
  id: 'scene-next',
  heading: 'EXT. ALLEY - NIGHT',
  summary: 'The chase continues.',
  blocks: [
    {
      id: 'block-next-1',
      type: BlockType.ACTION,
      text: 'Footsteps skid over rain-slick pavement.',
      blockRevision: 1
    }
  ]
};

const existingContext: StoryContext = {
  title: 'Draft',
  genre: 'Noir',
  premise: 'A clue changes everything.',
  characters: ['Alex'],
  scenes: [openingScene]
};

function WorkspaceHarness() {
  const workspace = useStoryWorkspace({ titleInputRef: createRef<HTMLInputElement>() });

  return (
    <div>
      <button type="button" onClick={() => void workspace.handleStart()}>
        Start
      </button>
      <button type="button" onClick={() => void workspace.handleGenerateNext()}>
        Next
      </button>
      <div data-testid="reveal-target">{workspace.revealScrollTargetId ?? ''}</div>
      <div data-testid="scene-count">{workspace.context?.scenes.length ?? 0}</div>
    </div>
  );
}

describe('scene generation reveal targets', () => {
  beforeEach(() => {
    executeGenerateSceneMock.mockReset();
  });

  it('uses the first generated scene heading as the reveal target', async () => {
    executeGenerateSceneMock.mockResolvedValueOnce(openingScene);

    render(<WorkspaceHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('scene-count').textContent).toBe('1');
      expect(screen.getByTestId('reveal-target').textContent).toBe('scene-heading-scene-opening');
    });
  });

  it('uses the newly generated later scene heading as the reveal target', async () => {
    const contextRef = { current: existingContext as StoryContext | null };
    const setRevealScrollTargetId = vi.fn();
    const setRevealScrollToken = vi.fn();

    executeGenerateSceneMock.mockResolvedValueOnce(nextScene);

    const controller = createScriptMutationController({
      applyContextMutation: (mutation) => {
        const previous = contextRef.current;
        const next = typeof mutation === 'function' ? mutation(previous) : mutation;
        if (next === previous) {
          return false;
        }
        contextRef.current = next;
        return true;
      },
      clearRedo: vi.fn(),
      pushUndoAction: vi.fn(),
      resolveCharacterName: (value) => value,
      normalizeSceneCharacters: (scene) => scene,
      handleAiError: vi.fn(),
      contextRef,
      promptContextRevisionRef: { current: 0 },
      scriptIdRef: { current: 'script-1' },
      activeGenerationScopeRef: { current: null },
      orchestratorRef: { current: new GenerationOrchestrator() },
      setRevealScrollTargetId,
      setRevealScrollToken,
      setInsertCompleteToken: vi.fn(),
      setUserInstruction: vi.fn(),
      setIsGenerating: vi.fn(),
      setError: vi.fn(),
      setToast: vi.fn()
    });

    await controller.generateNextScene({
      context: existingContext,
      isGenerating: false,
      userInstruction: ''
    });

    expect(setRevealScrollTargetId).toHaveBeenCalledWith('scene-heading-scene-next');
    expect(setRevealScrollToken).toHaveBeenCalledTimes(1);
  });
});
