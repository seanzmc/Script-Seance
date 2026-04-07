import { useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { RotateCcw } from 'lucide-react';
import { ScriptPane } from './components/ScriptPane';
import { PromptInspector } from './components/PromptInspector';
import { LoginModal } from './components/LoginModal';
import { PrivacyModal } from './components/PrivacyModal';
import { floatingNoticeVariants } from './components/motion/primitives';
import { useStoryWorkspace } from './hooks/useStoryWorkspace';

export { sanitizeGeneratedInsertText } from './services/scriptController';

export default function App() {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const workspace = useStoryWorkspace({ titleInputRef });

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden relative">
      <ScriptPane
        context={workspace.context}
        titleInputRef={titleInputRef}
        onTitleChange={workspace.handleTitleChange}
        suggestedTitle={workspace.suggestedTitle}
        isSuggestingTitle={workspace.isSuggestingTitle}
        suggestedTitleDismissed={workspace.suggestedTitleDismissed}
        onUseSuggestedTitle={workspace.handleUseSuggestedTitle}
        onDismissSuggestedTitle={workspace.handleDismissSuggestedTitle}
        onClearDraft={workspace.handleClearDraft}
        autosaveError={workspace.autosaveError}
        error={workspace.error}
        userInstruction={workspace.userInstruction}
        onInstructionChange={workspace.setUserInstruction}
        onGenerateNext={workspace.handleGenerateNext}
        onPlotTwist={workspace.handleTwist}
        onUndo={workspace.handleUndo}
        onRedo={workspace.handleRedo}
        canUndo={workspace.canUndo}
        canRedo={workspace.canRedo}
        insertCompleteToken={workspace.insertCompleteToken}
        onChangeSpeaker={workspace.handleChangeSpeaker}
        onInsertError={(err) => workspace.handleAiError(err, 'Failed to generate block.')}
        onGenerateRewritePreview={workspace.handleGenerateRewritePreview}
        onApplyRewritePreview={workspace.handleApplyRewritePreview}
        onDeleteBlock={workspace.handleDeleteBlock}
        onInsertAtAnchor={workspace.handleInsertAtAnchor}
        onGenerateInsertAtAnchor={workspace.handleGenerateInsertAtAnchor}
        onUpdateSceneHeading={workspace.handleUpdateSceneHeading}
        isGenerating={workspace.isGenerating}
        isGeneratingNextScene={workspace.isGeneratingNextScene}
        isPlaying={workspace.isPlaying}
        onCancelGenerate={workspace.cancelAiRequest}
        currentBlockId={workspace.currentBlockId}
        currentBlockIndex={workspace.currentBlockIndex}
        blockStatuses={workspace.blockStatuses}
        showHighlights={workspace.showHighlights}
        autoScroll={workspace.autoScroll}
        onOpenPrivacy={workspace.openPrivacy}
        onOpenSetup={workspace.openManualSetup}
        onSaveStyle={workspace.handleSaveStyle}
        isSetupOpen={workspace.isSetupOpen}
        onCloseSetup={workspace.closeSetup}
        setupState={workspace.setupState}
        onSetupChange={workspace.updateSetupState}
        onSetupSurprise={workspace.handleSetupSurprise}
        onStartSetup={workspace.handleStart}
        setupAutoSurprise={workspace.setupAutoSurprise}
        onSetupError={workspace.handleAiError}
        onExportTxt={workspace.handleDownload}
        onExportPdf={workspace.handleExportPdf}
        canExport={Boolean(workspace.context)}
        playbackProps={workspace.playbackProps}
        voicesContent={workspace.voicesContent}
        revealScrollTargetId={workspace.revealScrollTargetId}
        revealScrollMode={workspace.revealScrollMode}
        revealScrollToken={workspace.revealScrollToken}
      />

      {workspace.isPromptDebugEnabled && (
        <PromptInspector
          traces={workspace.promptDebugTraces}
          onClear={workspace.clearPromptDebugTraces}
        />
      )}

      <AnimatePresence initial={false}>
        {workspace.toast ? (
          <m.div
            key={`toast-${workspace.toast.message}`}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white shadow-2xl"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={floatingNoticeVariants}
          >
            <span className="text-sm font-medium">{workspace.toast.message}</span>
            {workspace.toast.onUndo && (
              <button
                onClick={workspace.toast.onUndo}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 px-2 py-1 rounded flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
          </m.div>
        ) : null}
      </AnimatePresence>

      <LoginModal
        isOpen={workspace.authStatus === 'unauthenticated'}
        isLoading={workspace.isAuthLoading}
        error={workspace.authError}
        pendingEmail={workspace.pendingAuthEmail}
        onLogin={workspace.handleLogin}
        onVerifyCode={workspace.handleVerifyCode}
      />
      <PrivacyModal isOpen={workspace.isPrivacyOpen} onClose={workspace.closePrivacy} />
    </div>
  );
}
