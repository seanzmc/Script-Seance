# Static Copy Audit Report

Generated: 2026-03-31
Total files scanned: 28
Total strings found: 524
Strings flagged: 26 (REWRITE: 19, REDUNDANT: 5, PLACEHOLDER: 0, TONE: 2)

Notes:
- `components/workspace/sceneGenerationLoadingCopy.ts` was skipped per spec.
- `components/PromptInspector.tsx` was excluded as developer-facing debug UI.
- `components/Button.tsx`, `components/AnchoredPopover.tsx`, and `components/motion/AppMotionProvider.tsx` were reviewed and not included in the count because they do not contain user-facing static copy to audit.

---

## Flagged Items

### WorkspaceSetupOverlay.tsx
**Location:** `components/workspace/WorkspaceSetupOverlay.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 162 | "Locking in the opening beat and preparing the workspace." | REWRITE | "Opening scene coming up. Setting the stage." | Describes internal system work instead of what the user is getting. |
| 163 | "Pick a genre and let AI shape your opening spark." | REWRITE | "Pick a genre, then cue up your opening scene." | Leads with AI process language instead of the user's action and outcome. |

### DraftComposerPanel.tsx
**Location:** `components/workspace/DraftComposerPanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 54 | "Draft Composer" | REDUNDANT | Delete | The label repeats the panel's purpose without adding meaning beyond "Next Beat." |

### StyleSelectionStage.tsx
**Location:** `components/setup/StyleSelectionStage.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 94 | "Style stays optional. Pick a vibe if it helps, then choose whether AI writes the premise or you do before moving into the final setup details." | REWRITE | "Pick a vibe if you want one, then let AI pitch the premise or write your own." | Too process-heavy and references setup flow mechanics instead of the user's next choice. |
| 206 | "Generate AI Premise" | REWRITE | "Let AI pitch the premise" | Sounds like a backend action label rather than a user-facing invitation. |
| 216 | "Write My Own Premise" | TONE | "Write the premise myself" | Accurate today, but stiff compared with the rest of the flow. |
| 254 | "Switch to Manual Premise" | REWRITE | "Write it myself instead" | "Manual premise" is system/process wording, not natural user language. |

### DetailsStage.tsx
**Location:** `components/setup/DetailsStage.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 85 | "Go back to Step 2 to change the style or switch between AI and manual premise setup." | REDUNDANT | Delete | This is wizard/process guidance that duplicates controls already visible elsewhere. |

### SetupForm.tsx
**Location:** `components/SetupForm.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 746 | "Edit setup (regenerates script)" | REWRITE | "Change setup" | The button label centers implementation detail; the confirmation can carry the warning instead. |
| 801 | "Edit Step 1" | REWRITE | "Change genre" | Step numbers are internal flow labels; the user action is to change the genre. |
| 838 | "Edit Step 2" | REWRITE | "Change style" | Same issue as above: "Step 2" describes the wizard, not the task. |

### StyleEditModal.tsx
**Location:** `components/StyleEditModal.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 76 | "Use the same tone module available in setup." | REWRITE | "Pick a tone from the library or write your own." | "Tone module" is internal/product language, not natural UI copy. |
| 115 | "Custom override" | REWRITE | "Custom style note" | "Override" is implementation language; the field is really a note or direction from the user. |

### StyleLibraryDialog.tsx
**Location:** `components/StyleLibraryDialog.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 48 | "Pick the same tone module used in setup." | REWRITE | "Pick a tone for this script." | "Tone module" is dev/product wording and "used in setup" is unnecessary context here. |

### StyleSelectionCard.tsx
**Location:** `components/StyleSelectionCard.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 67 | "Custom style selected." | REDUNDANT | Delete | The selected style name is already visible directly above this line. |

### InsertComposerPopover.tsx
**Location:** `components/InsertComposerPopover.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 187 | "Insert Typed Block" | REWRITE | "Insert as written" | The current label describes implementation mechanics instead of the user's choice. |

### PlaybackPanel.tsx
**Location:** `components/PlaybackPanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 217 | Header row: "Transport" / "Speaking: …" | REDUNDANT | Delete entire header row (`<div>` at lines 217-225) | The panel state and controls already communicate context. "Transport" is jargon-y, and the row adds noise without helping the user take action. |
| 290 | "Refresh" | REWRITE | "Rebuild audio" | Too vague for a destructive/reprocessing action that regenerates all audio. |
| 299 | "Purge" | REWRITE | "Clear audio" | "Purge" is internal/admin language and harsher than necessary for the user action. |

### WorkspaceAudioDrawer.tsx
**Location:** `components/workspace/WorkspaceAudioDrawer.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 47 | "Playback and Voice Utility" | REWRITE | "Voice & Playback" | "Utility" reads like an internal tool name, not a user-facing section title. |
| 48 | "Assign voices, control playback, and tune follow-along behavior." | REWRITE | "Preview voices, play the draft, and follow along as it reads." | "Tune follow-along behavior" is implementation-oriented and vague. |

### WorkspaceHeader.tsx
**Location:** `components/workspace/WorkspaceHeader.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 152 | "No style set" | TONE | "Default tone" | Accurate, but flatter and less in-voice than the surrounding screenplay-themed copy. |

### VoiceCastingModal.tsx
**Location:** `components/VoiceCastingModal.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 150 | "Voice assigned in draft but missing from active provider catalog." | REWRITE | "This voice isn't available right now, but it's still assigned to this character." | The current message exposes system/provider internals instead of explaining the state clearly. |

### VoiceManager.tsx
**Location:** `components/VoiceManager.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 134 | "TTS provider not configured" | REWRITE | "Voice preview unavailable" | Uses an internal acronym and setup detail instead of a direct user-facing explanation. |

### VoicesPanel.tsx
**Location:** `components/VoicesPanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 34 | "Assign voices and preview reads. Defaults are auto-assigned." | REWRITE | "Choose voices and preview how each part reads." | "Defaults are auto-assigned" reads like implementation detail, not user benefit. |

### ScriptPane.tsx
**Location:** `components/ScriptPane.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 271 | "Start Screen" | REDUNDANT | Delete | This label describes the UI state rather than helping the user do anything. |

---

## Clean Items (no changes needed)

- `components/GenreCycleWheel.tsx`
- `components/LengthCycleWheel.tsx`
- `components/LoginModal.tsx`
- `components/PlaybackMiniPlayer.tsx`
- `components/PrivacyModal.tsx`
- `components/RewriteComposerPopover.tsx`
- `components/ScriptDisplay.tsx`
- `components/TitleEditModal.tsx`
- `components/setup/GenreWheelStage.tsx`
- `components/workspace/DraftOutlinePanel.tsx`
- `components/workspace/SceneOutlineDrawer.tsx`
- `stylesLibrary.ts`
