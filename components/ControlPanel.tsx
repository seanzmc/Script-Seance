import React from 'react';

interface ControlPanelProps {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ header, children, footer }) => {
  return (
    <aside
      className="w-full lg:w-[380px] lg:min-w-[340px] lg:max-w-[420px] bg-gray-800 border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col shrink-0"
      aria-label="Control panel"
    >
      <div className="p-4 border-b border-gray-700 bg-gray-900/40 shrink-0">
        {header}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {children}
      </div>

      {footer && (
        <div className="p-4 border-t border-gray-700 bg-gray-900/60 shrink-0">
          {footer}
        </div>
      )}
    </aside>
  );
};
