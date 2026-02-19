import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomToolbelt, BottomToolbeltProps, ToolKey } from '../components/BottomToolbelt';

type MatchMediaListener = (event: MediaQueryListEvent) => void;
type LegacyMatchMediaListener = (this: MediaQueryList, ev: MediaQueryListEvent) => void;

interface MockMediaQueryList extends MediaQueryList {
  _listeners: Set<MatchMediaListener>;
  _legacyListeners: Set<LegacyMatchMediaListener>;
}

const createMatchMediaMock = () => {
  const originalMatchMedia = window.matchMedia;
  let currentWidth = 1280;
  const registry = new Map<string, MockMediaQueryList>();

  const evaluateQuery = (query: string) => {
    const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    if (maxWidthMatch) {
      return currentWidth <= Number(maxWidthMatch[1]);
    }
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    if (minWidthMatch) {
      return currentWidth >= Number(minWidthMatch[1]);
    }
    return false;
  };

  const notifyListeners = (query: string, mediaQuery: MockMediaQueryList, nextMatches: boolean) => {
    if (mediaQuery.matches === nextMatches) return;
    (mediaQuery as unknown as { matches: boolean }).matches = nextMatches;
    const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
    mediaQuery.onchange?.call(mediaQuery, event);
    mediaQuery._listeners.forEach(listener => listener(event));
    mediaQuery._legacyListeners.forEach(listener => listener.call(mediaQuery, event));
  };

  const buildMediaQueryList = (query: string): MockMediaQueryList => ({
    media: query,
    matches: evaluateQuery(query),
    onchange: null,
    _listeners: new Set<MatchMediaListener>(),
    _legacyListeners: new Set<MatchMediaListener>(),
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change' || typeof listener !== 'function') return;
      const fn = listener as MatchMediaListener;
      const mediaQuery = registry.get(query);
      mediaQuery?._listeners.add(fn);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change' || typeof listener !== 'function') return;
      const fn = listener as MatchMediaListener;
      const mediaQuery = registry.get(query);
      mediaQuery?._listeners.delete(fn);
    },
    addListener: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      const mediaQuery = registry.get(query);
      mediaQuery?._legacyListeners.add(listener);
    },
    removeListener: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      const mediaQuery = registry.get(query);
      mediaQuery?._legacyListeners.delete(listener);
    },
    dispatchEvent: () => true
  } as MockMediaQueryList);

  window.matchMedia = vi.fn((query: string) => {
    const existing = registry.get(query);
    if (existing) return existing;
    const mediaQuery = buildMediaQueryList(query);
    registry.set(query, mediaQuery);
    return mediaQuery;
  });

  const setViewportWidth = (nextWidth: number) => {
    currentWidth = nextWidth;
    registry.forEach((mediaQuery, query) => {
      const nextMatches = evaluateQuery(query);
      notifyListeners(query, mediaQuery, nextMatches);
    });
  };

  const restore = () => {
    window.matchMedia = originalMatchMedia;
  };

  return { setViewportWidth, restore };
};

const renderToolbelt = (props: Partial<BottomToolbeltProps> = {}) => {
  const defaultProps: BottomToolbeltProps = {
    activeTool: null,
    onSelectTool: vi.fn(),
    onCloseTool: vi.fn(),
    generateContent: <div>Generate panel body</div>
  };
  return render(<BottomToolbelt {...defaultProps} {...props} />);
};

const ToolbeltHarness: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const handleSelectTool = (tool: ToolKey) => {
    setActiveTool(current => (current === tool ? null : tool));
  };
  return (
    <BottomToolbelt
      activeTool={activeTool}
      onSelectTool={handleSelectTool}
      onCloseTool={() => setActiveTool(null)}
      generateContent={<div>Generate panel body</div>}
    />
  );
};

describe('BottomToolbelt responsive tools drawer', () => {
  const matchMediaMock = createMatchMediaMock();

  beforeAll(() => {
    matchMediaMock.setViewportWidth(1280);
  });

  beforeEach(() => {
    matchMediaMock.setViewportWidth(1280);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterAll(() => {
    matchMediaMock.restore();
  });

  it('shows the existing inline toolbelt on wide screens (1280px)', () => {
    renderToolbelt();

    expect(screen.queryByRole('button', { name: 'Tools' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Tools' })).toBeNull();
  });

  it('shows only the Tools trigger on 900px and opens the drawer', () => {
    matchMediaMock.setViewportWidth(900);
    renderToolbelt();

    expect(screen.getByRole('button', { name: 'Tools' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
  });

  it('keeps narrow behavior at 640px', () => {
    matchMediaMock.setViewportWidth(640);
    renderToolbelt();

    expect(screen.getByRole('button', { name: 'Tools' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
  });

  it('calls onSelectTool and closes drawer when selecting from drawer', () => {
    const onSelectTool = vi.fn();
    matchMediaMock.setViewportWidth(900);
    renderToolbelt({ onSelectTool });

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(onSelectTool).toHaveBeenCalledWith('generate');
    expect(screen.queryByRole('dialog', { name: 'Tools' })).toBeNull();
  });

  it('closes the drawer on Escape', () => {
    matchMediaMock.setViewportWidth(900);
    renderToolbelt();

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Tools' })).toBeNull();
  });

  it('closes the drawer on backdrop click', () => {
    matchMediaMock.setViewportWidth(900);
    renderToolbelt();

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByTestId('tools-drawer-backdrop'));

    expect(screen.queryByRole('dialog', { name: 'Tools' })).toBeNull();
  });

  it('moves focus into the drawer and focuses panel close after tool selection', async () => {
    matchMediaMock.setViewportWidth(900);
    render(<ToolbeltHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    const drawerCloseButton = screen.getByRole('button', { name: 'Close tools drawer' });
    await waitFor(() => {
      expect(document.activeElement).toBe(drawerCloseButton);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    const panelCloseButton = screen.getByRole('button', { name: 'Close tool panel' });
    await waitFor(() => {
      expect(document.activeElement).toBe(panelCloseButton);
    });
    expect(screen.getByText('Generate panel body')).toBeTruthy();
  });
});
