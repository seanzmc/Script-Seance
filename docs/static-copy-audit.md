# Static Copy Audit Report

Generated: 2026-04-02  
Total files scanned: 37  
Total strings found: ~180  
Strings flagged: 34 (REWRITE: 13, REDUNDANT: 6, TONE: 15, PLACEHOLDER: 0)

---

## Flagged Items

### GenreCycleWheel.tsx
**Location:** `components/GenreCycleWheel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 484 | `aria-label="Genre: {value}. Click to cycle or drag vertically."` | REDUNDANT | `aria-label="Genre: {value}"` | Interaction instructions in aria-labels are anti-pattern — screen readers don't need a usage manual for a scroll wheel. The role description ("genre wheel") already communicates affordance. |
| 486 | `title="Click to cycle genre. Drag vertically to spin and release to glide."` | REDUNDANT | Remove or `title="Genre"` | Tooltip restates the interaction mechanic. Users don't need a manual for a scroll wheel. |
| 563–565 | `"Click to cycle. Drag vertically to spin and release to glide."` (rendered text below wheel) | REDUNDANT, TONE | Delete | Visible instructional copy for a standard wheel interaction. "Glide" describes an animation physics behavior, not a user goal. Candidate for removal. |

---

### GenreWheelStage.tsx
**Location:** `components/setup/GenreWheelStage.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 52–55 | `"Keep one decision in front of you. Click to step forward, or hold and drag vertically for a slot-style scrub."` | REDUNDANT, TONE | Delete | Describes the engineering rationale ("keep one decision in front of you") and interaction mechanics in dev vocabulary ("slot-style scrub"). User goal is "pick a genre." Candidate for removal; if kept, needs a complete rewrite. |

---

### SetupForm.tsx
**Location:** `components/SetupForm.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| ~274 | `"This will overwrite your current premise and characters. Continue?"` (window.confirm) | TONE | — (flag for discussion — see Notes) | Browser confirm dialogs are visually mismatched. The message itself is accurate but delivery clashes with the app aesthetic. |
| ~367 | `"Editing setup will clear the current draft and regenerate the script. Continue?"` (window.confirm) | TONE | — (same as above) | Same problem. |
| ~962 | `"Going back will clear the current premise and characters so you can rebuild from that earlier step."` | REWRITE | `"Your premise and characters will be cleared — you'll start that step fresh."` | "So you can rebuild from that earlier step" is an explanatory hedge that restates the obvious. |

---

### StyleSelectionStage.tsx
**Location:** `components/setup/StyleSelectionStage.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 93–95 | `"Pick a vibe if you want one, then let AI pitch the premise or write your own."` | REWRITE | `"Pick a tone, or skip straight to the premise."` | Two separate actions conflated into one sentence (style selection + premise authorship). Premise is the *next* step, not this one. "If you want one" front-loads an apology for the feature. |

---

### DetailsStage.tsx
**Location:** `components/setup/DetailsStage.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 165–166 | `"AI draft"` / `"Manual draft"` (premise source badge) | TONE | `"AI-written"` / `"Your draft"` | Internal taxonomy. Users want to know if they wrote it or the AI did, not which "draft source" is active. |
| 219 | `"Built in"` (narrator badge) | TONE | `"Always present"` or remove | Dev-speak. The narrator is always in the cast; if the badge exists to explain that, rename it. Consider whether it earns its space at all. |
| ~249 | `placeholder="Character {index + 1}"` | TONE | `placeholder="Name"` | Reads like a spreadsheet field label. "Name" is shorter, warmer, and actually useful as a hint. |

---

### DraftComposerPanel.tsx
**Location:** `components/workspace/DraftComposerPanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 104 | `"Continue"` (primary generate button) | REWRITE | `"Write Next Scene"` or `"Generate Scene"` | Ambiguous — reads as a navigation action, not a generation trigger. Sitting next to "Twist" and "Insert Beat", it gives no signal that it will kick off AI generation. The button calls `onGenerateNext`; the label should say so. |
| 91 | `"Trim prompts."` (inline length warning) | TONE | `"Getting long."` | "Trim prompts" is a command in a scolding tone. The app voice is irreverent, not bossy. |

---

### WorkspaceAudioDrawer.tsx
**Location:** `components/workspace/WorkspaceAudioDrawer.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 65 | `"Voice controls unavailable."` (fallback state) | REWRITE | `"Voice cast not set up yet."` | "Unavailable" is a dead-end system message. The actual reason is that voices haven't been configured — say that instead. |

---

### DraftOutlinePanel.tsx
**Location:** `components/workspace/DraftOutlinePanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 30 | `"Scenes will appear here once the script has content."` | REWRITE | `"No scenes yet."` | Explains how the UI works rather than describing the empty state. One line is enough. |

---

### PlaybackPanel.tsx
**Location:** `components/PlaybackPanel.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 105 | `"Playback running"` (statusHeadline) | TONE | `"Now playing"` | Mechanical. The rest of the playback copy leans theatrical ("Ready to perform"). "Playback running" doesn't match. |
| 317 | `"Waiting for current block audio."` | TONE | `"Loading audio…"` | Dev-speak ("current block"). The user just needs to know it's loading. |
| 343–345 | `"{n} block{s} need attention. Jump back to retry or skip."` | REWRITE | `"{n} line{s} failed. Scroll back to retry or skip."` | "Need attention" is bureaucratic vagueness. "Blocks" is internal terminology — "lines" is more human. |

---

### LoginModal.tsx
**Location:** `components/LoginModal.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 62 | `"Admin Login"` (modal title) | REWRITE | `"Sign In"` | "Admin" implies a privileged role the user may not identify with. This is a password-protected app, not an admin console. |
| 63 | `"Enter the password to unlock AI features."` | REWRITE | `"Enter the password to get started."` | "Unlock AI features" treats the login as a paywall bypass. Dev-product framing. |
| 83 | `placeholder="password"` | REDUNDANT | Remove placeholder | The label above already says "Password." The placeholder adds no information. |

---

### PrivacyModal.tsx
**Location:** `components/PrivacyModal.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 43 | `"How your draft and prompts are handled."` (modal subtitle) | TONE | `"What leaves your browser, and what doesn't."` | Neutral legalese. The actual content is about what gets sent where — lead with that. |
| 67 | `"Retention"` (section heading) | REWRITE | `"Your data"` | Legal terminology. Users don't think in retention policies. |
| 71 | `"Drafts autosave to your browser's localStorage for recovery."` | REWRITE | `"Your draft autosaves in your browser — it stays on your device."` | "localStorage" is a dev term. The important thing to communicate is that data stays on-device. |

---

### StyleEditModal.tsx
**Location:** `components/StyleEditModal.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 75 | `"Edit writing style"` (h2) | REDUNDANT | `"Tone & style"` or delete the h2 | The eyebrow label already says "Style." The h2 appends "writing" and "edit" without adding meaning. Either elevate to a more interesting h2 or let the eyebrow + subtitle carry the weight. |
| 114–115 | `"Custom style note"` (textarea label) | REWRITE | `"Your own tone"` | "Note" implies an annotation rather than the actual style input. The placeholder already demonstrates what goes here — the label should name the field. |

---

### InsertComposerPopover.tsx
**Location:** `components/InsertComposerPopover.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 155 | `"Add a character first"` (inline warning when dialogue has no characters) | TONE | `"No characters yet — add one in setup."` | Command delivered abruptly with no path forward. Adding a hint about where to go is more useful. |
| 169 | `"Leave blank and use Generate and Insert, or type the block you want inserted."` (placeholder) | REWRITE | `"Optional — leave blank to generate, or write it yourself."` | Overly instructional for a placeholder. Placeholder text should hint at what to type, not document the workflow. |

---

### RewriteComposerPopover.tsx
**Location:** `components/RewriteComposerPopover.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 72 | `"Rewrite Instructions"` (label) | TONE | `"Direction"` or `"What to change"` | "Rewrite Instructions" reads like a form field in a developer API reference. "Direction" fits the creative/theatrical voice. |
| 86 | `"Proposed Rewrite"` (label above preview) | TONE | `"Preview"` | "Proposed" is legalistic. The user just wants to see the candidate text. |

---

### VoiceManager.tsx
**Location:** `components/VoiceManager.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 101 | `"Built in"` (narrator badge) | TONE | `"Always present"` or remove | Same issue as in DetailsStage — dev vocabulary. If the badge exists to explain that the narrator is always in the cast, rename it to something user-meaningful. |

---

### ScriptPane.tsx
**Location:** `components/ScriptPane.tsx`

| Line | Current Copy | Flag | Suggested Replacement | Rationale |
|------|-------------|------|----------------------|-----------|
| 282–285 | `"Rate limits reset after a short wait. Try again in ~30s."` (error hint) | TONE | `"Too many requests — wait a moment and try again."` | "Rate limits" is API-provider terminology. Users shouldn't need to understand what a rate limit is to act on this. |
| 539 | `"Edit Scene Heading"` (h3 in heading editor popover) | REDUNDANT | Delete the h3 | The section label just above already reads "Scene Heading." The h3 repeats this. One or the other is enough. |
| 680 | `"Generate a script to begin playback."` (empty playback state) | TONE | `"Write something first."` | Functional but mechanical. Shorter and warmer fits the app voice. |

---

## Clean Items (no changes needed)

All strings in these files were reviewed and flagged OK — they were not skipped:

- `components/Button.tsx` — generic UI, no substantive copy
- `components/AnchoredPopover.tsx` — no user-facing copy
- `components/workspace/WorkspaceSetupOverlay.tsx` — "Start a new script", "Pick a genre, then cue up your opening scene.", "Generating your opening scene...", "Opening scene coming up. Setting the stage." all clear and on-voice
- `components/workspace/WorkspaceHeader.tsx` — header labels, export menu, toolbar buttons all clear; "Generate Next Scene", "Outline", "Audio", "Clear Draft", "Undo", "Redo", "Export Script (.txt)", "Export PDF" all OK
- `components/workspace/SceneOutlineDrawer.tsx` — "Scene Outline", "Navigate the draft", "Close scene outline" all OK
- `components/workspace/DraftOutlinePanel.tsx` (except L30) — "Scene N", headings, "Less" / "More" all OK
- `components/workspace/DraftComposerPanel.tsx` (except L91) — "Next Beat", "Draft saves locally", "Continue", "Twist", "Insert Beat", "Generating..." all OK
- `components/setup/GenreWheelStage.tsx` (except L52–55) — "Step 1", "Start with a genre", "Continue to Style", "Selected genre" all OK
- `components/setup/StyleSelectionStage.tsx` (except L93–95) — "Step 2", "Shape the tone", "Shuffle", "Browse", "Let AI pitch the premise", "Write the premise myself", "Try Again", "Write it myself instead" all OK
- `components/setup/DetailsStage.tsx` (except L165–166, L219, ~L249) — "Step 3", "Build the opening spark", "Premise", "Add Character", "Generate First Scene", all four starter idea chips all OK
- `components/TitleEditModal.tsx` — "Edit Title", "Rename your script", "Untitled Screenplay" placeholder all OK
- `components/StyleLibraryDialog.tsx` — "Style Library", "Pick a tone for this script.", "None (default style)", "No styles match your search." all OK
- `components/StyleSelectionCard.tsx` — "Selected style", "Sample line:", "Using default tone settings." all OK
- `components/VoicesPanel.tsx` — "VOICES", "Choose voices and preview how each part reads." both OK
- `components/VoiceManager.tsx` (except L101) — "ASSIGNMENTS", "Speed", "Pitch", "Cast", "Advanced", "Preview", "Stop" all OK
- `components/VoiceCastingModal.tsx` — "CAST VOICES", "Casting: {name}", "Assign a voice to your character.", voice card copy, "Available only", "No voices match your filters.", "This voice isn't available right now, but it's still assigned to this character." all OK
- `components/PlaybackPanel.tsx` (except L105, L317, L343–345) — "Ready to perform", "Audio error", "Generating audio", "Playback paused", "Rebuild audio", "Clear audio", "Audio failed for this block.", "Retry block", "Skip block", "Auto-scroll", "Highlight" all OK
- `components/PlaybackMiniPlayer.tsx` — status text ("Playing block X/Y", "Paused on block X/Y", "Playback ready") and controls all OK
- `components/ScriptPane.tsx` (except L282–285, L539, L680) — "SCRIPT SEANCE" splash, "Summon a writers room to draft cinematic scenes.", "Start a New Script", "INT. LOCATION - DAY" placeholder, "Save Heading" all OK
- `components/InsertComposerPopover.tsx` (except L155, L169) — "Insert Block", block type labels ("Action", "Scene Heading", "Dialogue", "Transition"), "Placement", "Insert Before" / "Insert After", "Insert as written", "Generate and Insert", "Generate Next Scene", "Cancel" all OK
- `components/RewriteComposerPopover.tsx` (except L72, L86) — "Rewrite Block", block type labels, "Apply", "Generate Rewrite", "Cancel" all OK
- `components/PrivacyModal.tsx` (except L43, L67, L71) — "Privacy", "Prompts and story text are sent to a third-party AI service for generation. Avoid sensitive or personal data.", "This app does not store your drafts on the server.", 'Use "Clear draft" to remove the local copy at any time.' all OK
- `components/SetupForm.tsx` (except ~L274, ~L367, ~L962) — "Change genre", "Change style", "Return to Step 1/2?", "Go back and clear setup details", "Change setup", "Clear draft", starter ideas, "No premise yet.", "Custom style selected." all OK
- `components/GenreCycleWheel.tsx` (except L484, L486, L563–565) — "Genre" label, genre values all OK
- `components/LengthCycleWheel.tsx` — "Length" label, "Short" / "Medium" / "Long" values, aria-label all OK
- `components/setupUiTokens.ts` — CSS token constants only, no copy
- `components/motion/primitives.ts`, `components/paperPopoverStyles.ts`, `components/styleDialogShellStyles.ts`, `components/setup/setupLayoutIds.ts` — no user-facing copy
- `components/PromptInspector.tsx` — dev debug tool, out of scope per spec
- `components/workspace/sceneGenerationLoadingCopy.ts` — explicitly out of scope per spec

---

## Notes for Phase 2

### Items with layout risk
- **InsertComposerPopover.tsx L169** — replacing the long placeholder with a shorter one reduces placeholder text width. Verify visually in narrow viewports.
- **ScriptPane.tsx L539** — if "Edit Scene Heading" h3 is deleted, confirm the popover still reads correctly with only the eyebrow label.

### Items to discuss before implementing
- **window.confirm dialogs (SetupForm.tsx ~L274, ~L367)** — the copy itself is accurate; the problem is delivery via a native browser dialog. Fixing the copy alone doesn't resolve the visual mismatch. Flag for a future pass on the confirmation UX pattern; for this copy pass, treat as TONE with suggested copy provided if you want to fix in place.
- **LoginModal "Admin Login"** — renaming to "Sign In" is correct, but confirm there is no admin-specific branching that depends on the "Admin" label being user-visible (e.g., conditional UI based on role).

### Candidates for copy file extraction (3+ changes in one component)
- **PrivacyModal.tsx** — 3 changes to static modal copy. Consider extracting to `PrivacyModal.copy.ts`.
- **PlaybackPanel.tsx** — 3 changes to status strings. Changes should be made directly inside `buildPlaybackViewModel`'s string expressions rather than creating a new file, since the logic is already centralized there.
