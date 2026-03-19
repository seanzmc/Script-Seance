import React from 'react';
import { AlertCircle, Loader2, PlusCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../Button';
import {
  paperPopoverAnimatedShellClassName,
  paperPopoverLabelClassName,
  paperPopoverTextAreaClassName,
  paperPopoverTitleClassName
} from '../paperPopoverStyles';

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
  error: string | null;
  insertSceneBeatDisabled: boolean;
  onOpenPrivacy: () => void;
  sceneCountLabel: string;
  className?: string;
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
  error,
  insertSceneBeatDisabled,
  onOpenPrivacy,
  sceneCountLabel,
  className
}) => {
  const promptCount = userInstruction.length;
  const promptWarning = promptCount > PROMPT_CHAR_LIMIT;

  return (
    <section className={`${paperPopoverAnimatedShellClassName} p-4 sm:p-4 ${className ?? ''}`.trim()}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={paperPopoverLabelClassName}>Draft Composer</p>
            <h2 className={`${paperPopoverTitleClassName} mt-1`}>Shape the next beat</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Keep the prompt short and directional, then continue writing or branch with a twist.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span>Draft saves locally</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="draft-composer-prompt" className={paperPopoverLabelClassName}>
              Prompt
            </label>
            <span className={`text-[10px] ${promptWarning ? 'text-amber-700' : 'text-gray-500'}`}>
              {promptCount}/{PROMPT_CHAR_LIMIT}
            </span>
          </div>
          <textarea
            id="draft-composer-prompt"
            aria-label="Draft prompt"
            value={userInstruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="Suggest an action, tonal shift, character beat, or next move..."
            className={`${paperPopoverTextAreaClassName} h-24`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Keep prompts concise.</span>
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="text-indigo-600 underline underline-offset-2 transition-colors hover:text-indigo-700"
              >
                Privacy
              </button>
              <span className="whitespace-nowrap">{sceneCountLabel}</span>
            </div>
            {promptWarning ? (
              <span className="whitespace-nowrap text-amber-700">Trim prompts to keep generation focused.</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Button
            onClick={onGenerateNext}
            disabled={isPlaying || isGenerating}
            className="justify-start sm:col-span-2 xl:col-span-1"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Generate / Continue Writing
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
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#d6cdbd] bg-white/85 px-3 py-2 text-[11px] text-gray-700">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              <span className="font-medium">Working on your request...</span>
            </span>
            <Button variant="ghost" size="sm" onClick={onCancelGenerate}>
              Cancel
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
