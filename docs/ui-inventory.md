# UI Inventory Report - Script Seance

Generated: 2026-02-17T19:30:33.037Z

## 1) Routing / Screen Map

- Routing system: **manual-history** (none)
- Evidence: `App.tsx:408`, `App.tsx:431`, `index.tsx:14`
- Notes: No React Router/Next.js dependency; route state managed via window.history and pathname checks in App.tsx.

| Route | Top-level component | Layout regions |
| --- | --- | --- |
| / | App | - App shell: Full-height root container with dark theme, overflow clipping, and relative positioning for overlays. (App.tsx:1311)<br/>- Main workspace: Primary editor and screenplay layout rendered through ScriptPane. (App.tsx:1312)<br/>- Transient toast lane: Bottom-centered feedback toast with optional undo action. (App.tsx:1388)<br/>- Global modals: Voice casting modal and login modal mounted at app root to overlay any state. (App.tsx:1405) |
| /privacy | App + PrivacyModal overlay | - Base workspace: Same workspace as `/`, preserved behind modal. (App.tsx:1311)<br/>- Privacy modal overlay: Full-screen backdrop + centered privacy dialog toggled by pathname `/privacy`. (App.tsx:1307) |

## 2) Component Inventory

- Total TSX components found: **15**
- Categories: pages/screens=1, layout=3, primitives=2, composed widgets=9

| Component | Path | Category | Props (name: type) | Used-by imports | Appears unused |
| --- | --- | --- | --- | --- | --- |
| App | App.tsx:200 | pages/screens | (none) | index.tsx | No |
| BottomToolbelt | components/BottomToolbelt.tsx:41 | layout | activeTool: ToolKey \| null, onSelectTool: (tool: ToolKey) => void, onCloseTool: () => void, onExportTxt?: () => void, onExportPdf?: () => void, exportDisabled?: boolean, generateContent?: React.ReactNode, rewriteContent?: React.ReactNode, playbackContent?: React.ReactNode, voicesContent?: React.ReactNode, insertContent?: React.ReactNode | components/ScriptPane.tsx | No |
| Button | components/Button.tsx:9 | primitives | variant?: 'primary' \| 'secondary' \| 'danger' \| 'ghost' \| 'accent', size?: 'sm' \| 'md' \| 'lg', loading?: boolean | components/BottomToolbelt.tsx, components/InsertBlock.tsx, components/LoginModal.tsx, components/PrivacyModal.tsx, components/ScriptPane.tsx, components/SetupForm.tsx, components/TitleEditModal.tsx | No |
| InsertBlock | components/InsertBlock.tsx:111 | composed widgets | characters: string[], genre: string, onAddBlock: (block: ScriptBlock) => void, onStartInsertMode: (block: ScriptBlock) => void, insertModeActive: boolean, insertCompleteToken: number, onError?: (error: unknown) => void, disabled?: boolean, insertTarget?: { sceneId: string; blockId: string } \| null, styleContext?: string | components/ScriptPane.tsx | No |
| LoginModal | components/LoginModal.tsx:12 | composed widgets | isOpen: boolean, isLoading?: boolean, error?: string \| null, onLogin: (password: string) => void | App.tsx | No |
| PlaybackPanel | components/PlaybackPanel.tsx:32 | composed widgets | isPlaying: boolean, isPaused: boolean, isLoadingAudio: boolean, currentBlockId: string \| null, currentBlockIndex: number, blockStatuses: Record<string, 'notGenerated' \| 'generating' \| 'ready' \| 'error'>, onPlay: () => void, onPause: () => void, onResume: () => void, onStop: () => void, onPrev: () => void, onNext: () => void, onRetry: () => void, onSkip: () => void, onRefreshAudio: () => void, onPurgeAudio: () => void, bufferedCount: number, totalCount: number, currentSpeaker: string, playbackSpeed: number, onPlaybackSpeedChange: (speed: number) => void, showHighlights: boolean, onToggleHighlights: () => void, autoScroll: boolean, onToggleAutoScroll: () => void | App.tsx | No |
| HighlightIcon | components/PlaybackPanel.tsx:318 | primitives | className?: string | (none) | No |
| PrivacyModal | components/PrivacyModal.tsx:10 | composed widgets | isOpen: boolean, onClose: () => void | App.tsx | No |
| ScriptDisplay | components/ScriptDisplay.tsx:222 | layout | scenes: Scene[], currentBlockId: string \| null, currentBlockIndex: number, blockStatuses: Record<string, 'notGenerated' \| 'generating' \| 'ready' \| 'error'>, showHighlights: boolean, autoScroll: boolean, onToggleLock: (sceneId: string, blockId: string) => void, onSelectInsertTarget: (target: { sceneId: string; blockId: string }) => void, onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void, characters: string[], insertTarget?: { sceneId: string; blockId: string } \| null, rewriteTarget?: { sceneId: string; blockId: string } \| null, rewriteModeActive?: boolean, onSelectRewriteTarget?: (target: { sceneId: string; blockId: string }) => void, insertModeActive?: boolean, pendingInsertBlock?: ScriptBlock \| null, onConfirmInsertMode?: () => void, onCancelInsertMode?: () => void, className?: string, scrollable?: boolean, insertScrollTargetId?: string \| null, insertScrollToken?: number | components/ScriptPane.tsx | No |
| ScriptPane | components/ScriptPane.tsx:79 | layout | context: StoryContext \| null, titleInputRef: React.RefObject<HTMLInputElement>, onTitleChange: (title: string) => void, suggestedTitle: string \| null, isSuggestingTitle: boolean, suggestedTitleDismissed: boolean, onUseSuggestedTitle: () => void, onDismissSuggestedTitle: () => void, onClearDraft: () => void, autosaveError: string \| null, error: string \| null, userInstruction: string, onInstructionChange: (value: string) => void, onGenerateNext: () => void, onPlotTwist: () => void, onAddBlock: (block: ScriptBlock) => void, onUndo: () => void, onRedo?: () => void, canUndo?: boolean, canRedo?: boolean, insertTarget: InsertTarget \| null, insertModeActive: boolean, pendingInsertBlock: ScriptBlock \| null, onStartInsertMode: (block: ScriptBlock) => void, onCancelInsertMode: () => void, onConfirmInsertMode: () => void, insertCompleteToken: number, onSelectInsertTarget: (target: InsertTarget) => void, onChangeSpeaker: (sceneId: string, blockId: string, character: string) => void, onInsertError: (error: unknown) => void, onRegenerate: (sceneId: string, blockId: string, rewriteGuidance?: string) => void, onToggleLock: (sceneId: string, blockId: string) => void, isGenerating: boolean, isPlaying: boolean, isRegenerating: boolean, onCancelGenerate: () => void, currentBlockId: string \| null, currentBlockIndex: number, blockStatuses: Record<string, 'notGenerated' \| 'generating' \| 'ready' \| 'error'>, showHighlights: boolean, autoScroll: boolean, onOpenPrivacy: () => void, onOpenSetup: () => void, isSetupOpen: boolean, onCloseSetup: () => void, setupState: SetupFormState, onSetupChange: (next: Partial<SetupFormState>) => void, onStartSetup: () => void, setupAutoSurprise: boolean, styleContext?: string, onSetupError?: (error: unknown, fallbackMessage: string) => boolean, onExportTxt: () => void, onExportPdf?: () => void, canExport: boolean, playbackContent?: React.ReactNode, voicesContent?: React.ReactNode, insertScrollTargetId: string \| null, insertScrollToken: number | App.tsx | No |
| SetupForm | components/SetupForm.tsx:39 | composed widgets | value: SetupFormState, onChange: (next: Partial<SetupFormState>) => void, onStart?: () => void, isLoading: boolean, onError?: (error: unknown, fallbackMessage: string) => boolean, isLocked?: boolean, showSubmit?: boolean, onEditSetup?: () => void, onClearDraft?: () => void, variant?: "full" \| "summary", autoSurprise?: boolean | components/ScriptPane.tsx, tests/exportAndSetup.test.tsx | No |
| TitleEditModal | components/TitleEditModal.tsx:13 | composed widgets | isOpen: boolean, value: string, onChange: (value: string) => void, onSave: () => void, onClose: () => void, inputRef?: React.RefObject<HTMLInputElement> | components/ScriptPane.tsx | No |
| VoiceCastingModal | components/VoiceCastingModal.tsx:89 | composed widgets | isOpen: boolean, onClose: () => void, characterName: string, currentVoiceId: string, availableVoices: TtsVoice[], voiceConfigs: VoiceConfig[], onSelect: (voiceId: string) => void, onPreview: (voiceId: string) => void, isPreviewing?: boolean, previewVoiceId?: string \| null | App.tsx | No |
| VoiceManager | components/VoiceManager.tsx:17 | composed widgets | characters: string[], availableVoices: TtsVoice[], voiceConfigs: VoiceConfig[], onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void, onOpenCasting: (character: string) => void, onPreview: (config: VoiceConfig) => Promise<void>, onStop: () => void, isAudioPlaying: boolean, isLoading: boolean | components/VoicesPanel.tsx, tests/voiceManager.test.tsx | No |
| VoicesPanel | components/VoicesPanel.tsx:17 | composed widgets | characters: string[], availableVoices: TtsVoice[], voiceConfigs: VoiceConfig[], onUpdateConfig: (character: string, updates: Partial<VoiceConfig>) => void, onOpenCasting: (character: string) => void, onPreview: (config: VoiceConfig) => Promise<void>, onStop: () => void, isAudioPlaying: boolean, isLoading: boolean | App.tsx | No |

Unused flags (heuristic): None detected.

## 3) Style System Audit

- Styling approach:
- Tailwind utilities in JSX (`tailwind.config.js:1`, `index.css:1`)
- Global CSS for base + scrollbar (`index.css:5`)
- Additional inline style blocks for export/animation (`components/ScriptDisplay.tsx:38`, `components/VoiceCastingModal.tsx:390`)

- Theme/token sources:
- `tailwind.config.js` (font extension)
- `index.css` (base colors/fonts)
- `index.html` (font loading)
- `components/ScriptDisplay.tsx` (print/export paper styles)

Top repeated values (selected):
- Spacing tokens: gap-2 (55), py-2 (17), px-3 (16), px-4 (14), gap-3 (14), space-y-1 (12), gap-1 (12), p-4 (11)
- Radius tokens: rounded-full (22), rounded-lg (19), rounded-md (18), rounded-2xl (11), rounded-xl (8), rounded (7)
- Shadow tokens: shadow-lg (7), shadow-2xl (5), shadow-inner (3), shadow-sm (3), shadow-indigo-500/20 (2), shadow-[0_20px_60px_rgba(0,0,0,0.4)] (1)

Top 10 style patterns worth consolidating:

| Pattern | Occurrences | Example ref | Why consolidate |
| --- | --- | --- | --- |
| Toolbelt Chip Button | 13 | components/BottomToolbelt.tsx:169 | Uppercase compact buttons used in toolbelt and utility strips. |
| Secondary Button | 9 | components/BottomToolbelt.tsx:172 | Gray utility buttons with subtle hover and border. |
| Dark Card Container | 6 | components/BottomToolbelt.tsx:140 | Rounded dark cards with border and shadow used for panels and shells. |
| Primary Button | 6 | components/Button.tsx:21 | Indigo CTA buttons with white text and hover state. |
| Modal Backdrop Overlay | 5 | components/LoginModal.tsx:36 | Fixed full-screen backdrop with dimming and blur. |
| Ghost Button | 5 | components/BottomToolbelt.tsx:146 | Low-emphasis text action with transparent background and hover tint. |
| Modal Surface | 4 | components/LoginModal.tsx:38 | Centered dialog panel with radius, border, and heavy shadow. |
| Dark Input Field | 4 | components/InsertBlock.tsx:124 | Input/textarea controls using dark fill, gray border, and indigo focus ring. |
| Script Paper Canvas | 1 | components/ScriptDisplay.tsx:38 | Off-white screenplay canvas with border, texture, and drop shadow. |
| Toggle Switch | 1 | components/PlaybackPanel.tsx:142 | Two-state switch with rounded track and sliding knob. |

## 4) Recommendations (No Code Changes)

Minimal Design System v1 component list (based on current UI):
- **AppShell**: Single page shell + region framing for header, content, and overlays. (maps to App, ScriptPane)
- **SurfaceCard**: Unified bordered/radius panel container with dark variants. (maps to BottomToolbelt, SetupForm, PlaybackPanel)
- **Button**: Primary/secondary/ghost/accent action control. (maps to Button)
- **InputField**: Standardized text input/textarea/select visual states. (maps to LoginModal, TitleEditModal, InsertBlock)
- **Modal**: Shared overlay, dialog container, header, and footer structure. (maps to LoginModal, PrivacyModal, TitleEditModal, VoiceCastingModal)
- **TopBar**: Draft metadata and global actions strip. (maps to ScriptPane header)
- **Toolbelt**: Docked tools launcher with optional expandable panel. (maps to BottomToolbelt)
- **ScriptCanvas**: Paper-style screenplay viewport with optional editing chrome. (maps to ScriptDisplay)
- **ToggleRow**: Reusable icon + label + switch pattern. (maps to PlaybackPanel toggles)
- **RangeControl**: Slider + label/value control for numeric settings. (maps to PlaybackPanel, VoiceManager)

Minimal token set proposal inferred from usage:
- Spacing scale: 2px, 4px, 6px, 8px, 10px, 12px, 16px, 20px, 24px, 32px
- Radius scale: 6px, 8px, 12px, 16px, 24px
- Typography: fonts=Inter (UI), Courier Prime (screenplay body); sizes=10px, 11px, 12px, 14px, 16px, 20px, 24px; letter-spacing=tracking-widest, tracking-[0.24em], tracking-[0.32em]
- Color tokens: neutral=gray-950, gray-900, gray-800, gray-700, gray-500, gray-300, white; brand=indigo-600, indigo-500, indigo-400; semantic=red-500, amber-300, emerald-500; canvas=#f6f1e7, #d6cdbd

3 highest-leverage components to standardize first:
1. **Modal** - Four separate modal implementations repeat the same overlay, surface, and action-row structures. Refs: components/LoginModal.tsx:30, components/PrivacyModal.tsx:12, components/TitleEditModal.tsx:36, components/VoiceCastingModal.tsx:195
2. **SurfaceCard** - Card-like panel styles recur across toolbelt, setup blocks, playback controls, and form sections with minor drift. Refs: components/BottomToolbelt.tsx:143, components/SetupForm.tsx:184, components/PlaybackPanel.tsx:136, components/VoiceManager.tsx:86
3. **InputField** - Input/select/textarea controls have repeated dark-field + ring styles that diverge slightly by file. Refs: components/InsertBlock.tsx:120, components/LoginModal.tsx:63, components/TitleEditModal.tsx:54, components/SetupForm.tsx:276

## 5) Penpot Import Pack

Generated pack:
- SVGs: `docs/ui-inventory/penpot-pack/*.svg`
- Manifest: `docs/ui-inventory/penpot-pack/manifest.json`
- Zip: `docs/ui-inventory/penpot-pack.zip`

Manifest fields included per pattern:
- `componentName`
- `defaultBoundingBox`
- `visualVariationProps`
- `sourceFilePath`
