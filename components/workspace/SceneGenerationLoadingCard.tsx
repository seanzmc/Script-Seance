import React from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { Button } from '../Button';
import { fadeSlideYVariants } from '../motion/primitives';

const writingAnimStyle = `
  @keyframes ss-write {
    0%   { stroke-dashoffset: 70; opacity: 0; }
    10%  { opacity: 1; }
    75%  { stroke-dashoffset: 0; opacity: 1; }
    90%  { stroke-dashoffset: 0; opacity: 0; }
    100% { stroke-dashoffset: 70; opacity: 0; }
  }
  @keyframes ss-cursor {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ss-write-path { animation: none !important; stroke-dashoffset: 0; opacity: 1; }
    .ss-cursor-blink { animation: none !important; opacity: 1; }
  }
`;

export interface SceneGenerationLoadingCardProps {
  title: string;
  titleId?: string;
  loadingMessage?: string;
  onCancel: () => void;
  className?: string;
}

export const SceneGenerationLoadingCard: React.FC<SceneGenerationLoadingCardProps> = ({
  title,
  titleId,
  loadingMessage,
  onCancel,
  className
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <m.div
      className={`w-full max-w-[42rem] rounded-3xl border border-indigo-500/30 bg-indigo-500/10 px-11 py-14 text-center shadow-[0_0_40px_rgba(79,70,229,0.2)] sm:px-12 sm:py-[3.75rem] ${className ?? ''}`.trim()}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeSlideYVariants}
    >
      <style>{writingAnimStyle}</style>
      <div className="space-y-7">
        <div className="flex h-8 items-center justify-center gap-1.5" aria-hidden="true">
          <svg width="56" height="16" viewBox="0 0 48 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              className="ss-write-path"
              d="M2 11 C8 3, 16 3, 22 8 S38 3, 46 6"
              stroke="#818cf8"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="70"
              strokeDashoffset="70"
              style={{ animation: 'ss-write 2.4s ease-in-out infinite' }}
            />
          </svg>
          <span
            className="ss-cursor-blink select-none text-lg font-light leading-none text-indigo-400/90"
            style={{ animation: 'ss-cursor 1s step-end infinite' }}
          >
            |
          </span>
        </div>
        <div className="space-y-3">
          <p
            id={titleId}
            className="text-[1.55rem] font-semibold tracking-[-0.01em] text-white sm:text-[1.72rem]"
          >
            {title}
          </p>
          <div className="mx-auto flex min-h-[3.25rem] max-w-[28rem] items-center justify-center px-3">
            {prefersReducedMotion ? (
              loadingMessage ? (
                <p className="text-[1.02rem] leading-relaxed text-indigo-100/82" aria-live="polite">
                  {loadingMessage}
                </p>
              ) : null
            ) : (
              <AnimatePresence initial={false} mode="wait">
                {loadingMessage ? (
                  <m.p
                    key={loadingMessage}
                    className="text-[1.02rem] leading-relaxed text-indigo-100/82"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {loadingMessage}
                  </m.p>
                ) : null}
              </AnimatePresence>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="rounded-lg border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/10 hover:text-indigo-100"
        >
          Cancel
        </Button>
      </div>
    </m.div>
  );
};
