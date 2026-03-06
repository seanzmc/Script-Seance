import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchoredPopover } from '../components/AnchoredPopover';

const createRect = ({
  top,
  left,
  width,
  height
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}) => ({
  top,
  left,
  width,
  height,
  bottom: top + height,
  right: left + width,
  x: left,
  y: top,
  toJSON: () => ({ top, left, width, height })
});

const stubRect = (element: HTMLElement, rect: ReturnType<typeof createRect>) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AnchoredPopover', () => {
  it('clamps popovers below the provided top boundary', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    const anchor = document.createElement('button');
    const boundary = document.createElement('div');
    document.body.appendChild(anchor);
    document.body.appendChild(boundary);

    stubRect(anchor, createRect({ top: 40, left: 120, width: 40, height: 20 }));
    stubRect(boundary, createRect({ top: 180, left: 0, width: 900, height: 500 }));

    render(
      <AnchoredPopover open anchor={anchor} topBoundary={boundary}>
        <div>Popover body</div>
      </AnchoredPopover>
    );

    const wrapper = screen.getByText('Popover body').parentElement as HTMLElement;
    stubRect(wrapper, createRect({ top: 0, left: 0, width: 180, height: 120 }));

    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(Number.parseFloat(wrapper.style.top)).toBeGreaterThanOrEqual(192);
    });
  });
});
