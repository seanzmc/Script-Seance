import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { BlockType, StoryContext } from '../types';

const hydratedContext: StoryContext = {
  title: 'Hydrated Draft',
  genre: 'Noir',
  premise: 'A saved draft should load once.',
  characters: ['Alex'],
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. OFFICE - NIGHT',
      summary: 'Alex reviews the evidence board.',
      blocks: [
        {
          id: 'block-1',
          type: BlockType.ACTION,
          text: 'Alex studies the evidence board.',
          blockRevision: 1
        }
      ]
    }
  ]
};

const createMockResponse = (status: number, payload: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  text: vi.fn(async () => JSON.stringify(payload))
} as unknown as Response);

const createStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App draft hydration', () => {
  it('loads a saved draft without triggering a startup update loop', async () => {
    const storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true
    });
    vi.stubGlobal('localStorage', storage);

    storage.setItem('script-seance:draft:v1', JSON.stringify({
      context: hydratedContext,
      userInstruction: '',
      savedAt: '2026-03-27T00:00:00.000Z'
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/session')) {
        return createMockResponse(401, {
          error: {
            message: 'Unauthorized'
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('INT. OFFICE - NIGHT')).toBeTruthy();
      expect(screen.getByText('Alex studies the evidence board.')).toBeTruthy();
    });

    expect(screen.queryByText('Start a New Script')).toBeNull();
    expect(
      consoleErrorSpy.mock.calls.some(([message]) => (
        typeof message === 'string' && message.includes('Maximum update depth exceeded')
      ))
    ).toBe(false);
  });
});
