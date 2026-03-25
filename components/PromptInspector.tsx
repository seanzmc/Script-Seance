import React from 'react';
import { createPortal } from 'react-dom';
import type { PromptDebugTrace } from '../services/ai';

export type PromptInspectorProps = {
  traces: PromptDebugTrace[];
  onClear: () => void;
};

const formatNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? String(value) : 'n/a'
);

const formatPreview = (value: unknown) => {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const PromptInspector: React.FC<PromptInspectorProps> = ({ traces, onClear }) => {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-library w-[min(96vw,720px)] max-h-[78vh] overflow-hidden rounded-xl border border-emerald-400/35 bg-gray-950/95 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
          Prompt Inspector
        </p>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:border-gray-500 hover:text-white"
        >
          Clear
        </button>
      </div>

      {traces.length === 0 ? (
        <p className="text-[11px] text-gray-400">No prompt traces yet. Trigger a generation request.</p>
      ) : (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {traces.map((trace, index) => (
            <details
              key={`${trace.requestId || 'trace'}-${index}`}
              open
              className="rounded border border-gray-800 bg-gray-900/80 px-2 py-1"
            >
              <summary className="cursor-pointer select-none text-[11px] text-gray-100">
                {trace.kind} · {trace.provider}/{trace.model} · {formatNumber(trace.durationMs)}ms
              </summary>
              <div className="mt-2 space-y-2 text-[10px] text-gray-300">
                <p>requestId: {trace.requestId || 'n/a'}</p>
                <p>max_output_tokens: {formatNumber(trace.max_output_tokens)}</p>
                <p>timeoutMs: {formatNumber(trace.timeoutMs)}</p>
                <p>promptContextRevision: {formatNumber(trace.promptContextRevision)}</p>
                <p>styleFingerprint: {trace.styleFingerprint || 'none'}</p>
                <p>memoryBundle.sectionSizes: {trace.memoryBundle?.sectionSizes ? JSON.stringify(trace.memoryBundle.sectionSizes) : 'pending'}</p>
                <p>tokenUsage: {trace.tokenUsage ? JSON.stringify(trace.tokenUsage) : 'n/a'}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-[10px] text-gray-200">
                  instructionPreview: {formatPreview(trace.previews?.instruction)}
                </pre>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-[10px] text-gray-200">
                  contextPreview: {formatPreview(trace.previews?.context)}
                </pre>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-[10px] text-gray-200">
                  promptPreview: {formatPreview(trace.previews?.prompt)}
                </pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
