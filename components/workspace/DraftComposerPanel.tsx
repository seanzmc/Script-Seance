import React from 'react';
import { AlertCircle, Loader2, PlusCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../Button';

const PROMPT_CHAR_LIMIT = 320;

export interface DraftComposerPanelProps {
  userInstruction: string;
  onInstructionChange: (value: string) => void;
  onGenerateNext: () => void;
  onPlotTwist: () => void;
  onInsertSceneBeat: () => void;
  isGenerating: boolean;
  isPlaying: boolean;
  onCancelGenerate: () => void;
  sceneCount: number;
  error: string | null;
  insertSceneBeatDisabled: boolean;
}

export const DraftComposerPanel: React.FC<DraftComposerPanelProps> = ({
  userInstruction,
  onInstructionChange,
  onGenerateNext,
  onPlotTwist,
  onInsertSceneBeat,
  isGenerating,
  isPlaying,
  onCancelGenerate,
  sceneCount,
  error,
  insertSceneBeatDisabled
}) => {
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/45 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.2)] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Draft Composer</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Shape the next beat</h2>
            <p className="mt-1 text-sm text-gray-400">
              Keep the prompt short and directional, then continue writing or branch with a twist.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
            <span className="whitespace-nowrap">{sceneCount} {sceneCount === 1 ? 'scene' : 'scenes'}</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-emerald-200/85">
              <ShieldCheck className="h-3.5 w-3.5" />
              Draft saves locally
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="draft-composer-prompt" className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300">
              Prompt
            </label>
            <span className={`text-[10px] ${promptWarning ? 'text-amber-400' : 'text-gray-500'}`}>
              {promptCount}/{PROMPT_CHAR_LIMIT}
            </span>
          </div>
          <textarea
            id="draft-composer-prompt"
            aria-label="Draft prompt"
            value={userInstruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="Suggest an action, tonal shift, character beat, or next move..."
            className="h-24 w-full resize-none rounded-xl border border-gray-700 bg-gray-950 p-3 text-sm text-gray-100 shadow-inner outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
            <span>Visible drafting controls now replace the hidden generate menu.</span>
            {promptWarning && <span>Trim prompts to keep generation focused.</span>}
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          <Button
            onClick={onGenerateNext}
            disabled={isPlaying || isGenerating}
            className="justify-start shadow-lg shadow-indigo-500/20"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Continue Writing
          </Button>
          <Button
            onClick={onPlotTwist}
            variant="secondary"
            size="sm"
            disabled={isGenerating}
            className="justify-start"
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Plot Twist
          </Button>
          <Button
            onClick={onInsertSceneBeat}
            variant="secondary"
            size="sm"
            disabled={insertSceneBeatDisabled || isGenerating || isPlaying}
            className="justify-start"
          >
            <PlusCircle className="mr-2 h-3.5 w-3.5" />
            Insert Scene / New Beat
          </Button>
        </div>

        {isGenerating ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-400/20 bg-indigo-500/5 px-3 py-2 text-[11px] text-indigo-100">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              <span className="font-medium">Working on your request...</span>
            </span>
            <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
              Cancel
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
