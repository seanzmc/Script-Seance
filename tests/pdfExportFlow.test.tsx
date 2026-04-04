import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { buildScriptExportDocument, printScriptExport } from '../components/ScriptDisplay';
import { BlockType, StoryContext } from '../types';

vi.mock('../components/ScriptDisplay', async () => {
  const actual = await vi.importActual<typeof import('../components/ScriptDisplay')>('../components/ScriptDisplay');
  return {
    ...actual,
    printScriptExport: vi.fn()
  };
});

const exportContext: StoryContext = {
  title: 'Midnight Caller',
  genre: 'Noir',
  premise: 'A detective answers a phone that should not ring.',
  characters: ['Alex', 'Morgan'],
  scenes: [
    {
      id: 'scene-1',
      heading: 'INT. OFFICE - NIGHT',
      summary: 'Alex studies the evidence board.',
      blocks: [
        {
          id: 'action-1',
          type: BlockType.ACTION,
          text: 'Alex studies the evidence board.',
          blockRevision: 1
        },
        {
          id: 'dialogue-1',
          type: BlockType.DIALOGUE,
          character: 'Alex',
          parenthetical: '(quietly)',
          text: 'The phone should be dead.',
          blockRevision: 1
        }
      ]
    },
    {
      id: 'scene-2',
      heading: 'EXT. ALLEY - DAWN',
      summary: 'Morgan arrives in a hurry.',
      blocks: [
        {
          id: 'transition-1',
          type: BlockType.TRANSITION,
          text: 'CUT TO:',
          blockRevision: 1
        },
        {
          id: 'action-2',
          type: BlockType.ACTION,
          text: 'Morgan sprints through the rain.',
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

const renderHydratedApp = async () => {
  const storage = createStorage();
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true
  });
  vi.stubGlobal('localStorage', storage);

  storage.setItem('script-seance:draft:v1', JSON.stringify({
    context: exportContext,
    userInstruction: '',
    savedAt: '2026-04-04T00:00:00.000Z'
  }));

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/auth/session')) {
      return createMockResponse(200, {
        data: { ok: true }
      });
    }
    if (url.endsWith('/api/ai/generate')) {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const parsedBody = JSON.parse(rawBody) as { kind?: string };
      if (parsedBody.kind === 'listVoices') {
        return createMockResponse(200, {
          data: { voices: [] }
        });
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('INT. OFFICE - NIGHT')).toBeTruthy();
    expect(screen.getByText('Morgan sprints through the rain.')).toBeTruthy();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buildScriptExportDocument', () => {
  it('includes the current screenplay markup and iframe base URL without relying on popup auto-print scripts', () => {
    const html = buildScriptExportDocument(
      '<div data-script-export-root="true">INT. OFFICE - NIGHT</div>',
      'Midnight Caller',
      { baseHref: 'http://localhost:3000/' }
    );

    expect(html).toContain('<title>Midnight Caller</title>');
    expect(html).toContain('<base href="http://localhost:3000/" />');
    expect(html).toContain('data-script-export-root="true"');
    expect(html).not.toContain('window.print()');
  });
});

describe('PDF export flow', () => {
  it('passes the live screenplay DOM markup to the PDF export helper', async () => {
    const printScriptExportMock = vi.mocked(printScriptExport);
    printScriptExportMock.mockResolvedValue(undefined);

    await renderHydratedApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open export menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Export PDF' }));

    await waitFor(() => {
      expect(printScriptExportMock).toHaveBeenCalledTimes(1);
    });

    const [scriptMarkup, title] = printScriptExportMock.mock.calls[0];

    expect(title).toBe('Midnight Caller');
    expect(scriptMarkup).toContain('INT. OFFICE - NIGHT');
    expect(scriptMarkup).toContain('The phone should be dead.');
    expect(scriptMarkup).toContain('CUT TO:');
    expect(scriptMarkup).toContain('Morgan sprints through the rain.');
    expect(scriptMarkup).toContain('data-script-export-root="true"');
  });

  it('shows a visible error banner when PDF export fails', async () => {
    const printScriptExportMock = vi.mocked(printScriptExport);
    printScriptExportMock.mockRejectedValueOnce(new Error('PDF export failed for this browser.'));

    await renderHydratedApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open export menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Export PDF' }));

    await waitFor(() => {
      expect(screen.getByText('PDF export failed for this browser.')).toBeTruthy();
    });
  });
});
