import React from 'react';

export interface CastModeProps {
  hasDraft: boolean;
  content: React.ReactNode;
}

export const CastMode: React.FC<CastModeProps> = ({
  hasDraft,
  content
}) => (
  <section className="h-full overflow-y-auto bg-[#17181c]">
    <div className="mx-auto flex h-full w-full max-w-[1240px] flex-col px-4 py-5 sm:px-5 lg:px-6">
      <div className="mb-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-200/80">Cast Workspace</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Voice Casting</h2>
        <p className="mt-2 text-sm text-gray-400">
          Assign voices, preview reads, and tune character delivery without crowding the drafting surface.
        </p>
      </div>
      <div className="min-h-0 flex-1 rounded-2xl border border-gray-800 bg-gray-950/35 p-4 sm:p-5">
        {hasDraft ? content : <p className="text-sm text-gray-400">Generate a script to unlock voice casting.</p>}
      </div>
    </div>
  </section>
);
