import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptInspector } from '../components/PromptInspector';
import type { PromptDebugTrace } from '../services/ai';

const traceFixture: PromptDebugTrace = {
  requestId: 'req-1',
  kind: 'generateScene',
  provider: 'openai',
  model: 'gpt-test',
  max_output_tokens: 512,
  timeoutMs: 30000,
  promptContextRevision: 2,
  styleFingerprint: 'abc123',
  durationMs: 184,
  tokenUsage: null,
  previews: {
    prompt: 'FULL PROMPT BODY',
    instruction: 'Write opening scene',
    context: 'Style: 1940s Noir Detective'
  }
};

afterEach(() => {
  cleanup();
});

describe('PromptInspector overlay behavior', () => {
  it('renders via document.body portal and keeps high z-index for setup screen overlap', () => {
    const onClear = vi.fn();
    const { container } = render(<PromptInspector traces={[traceFixture]} onClear={onClear} />);
    const title = screen.getByText('Prompt Inspector');

    expect(container.contains(title)).toBe(false);

    const overlayRoot = title.closest('div.fixed');
    expect(overlayRoot).toBeTruthy();
    expect(overlayRoot?.className).toContain('z-[120]');
    expect(overlayRoot?.className).toContain('max-h-[78vh]');
  });

  it('keeps clear button interaction working', () => {
    const onClear = vi.fn();
    render(<PromptInspector traces={[traceFixture]} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows prompt previews expanded by default', () => {
    render(<PromptInspector traces={[traceFixture]} onClear={vi.fn()} />);

    expect(screen.getByText(/FULL PROMPT BODY/)).toBeTruthy();
  });
});
