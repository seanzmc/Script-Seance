# Style Library Redesign Plan

## Phase 1 scope

This document is the audit and implementation plan for the style library redesign. It covers findings only. No runtime code changes are included in this phase.

## Diagnosis

- Root cause: the current library UI renders the full catalog as one long grouped list, with category labels acting as lightweight separators rather than true navigation. That makes the list scan poorly and weakens discovery.
- Behavior type: mixed UI behavior and presentation. The redesign changes navigation and filtering behavior inside the picker, but should preserve downstream selection effects.
- Risk level: moderate. The visual redesign is localized, but the picker feeds two separate surfaces and participates in `style` / `styleId` synchronization.

## Canonical data and current consumers

### Style library data

- `stylesLibrary.ts`
  - Client-side canonical exports used by the current picker UI.
  - Exposes `StyleCategory`, `StyleItem`, `STYLE_CATEGORIES`, and `stylesLibrary`.
  - Each `StyleItem` already includes `id`, `category`, `title`, `description`, and `sampleLine`.
- `styleLibrary.json`
  - Server-side mirror of the same catalog.
  - Used by `server/llm/styleCatalog.js` to resolve style metadata by `styleId`.
- `services/setupStyle.ts`
  - Normalization layer for `style` / `styleId`.
  - Preserves compatibility between canonical library selections and freeform custom text.

### Consuming UI surfaces

- Setup flow
  - `components/SetupForm.tsx`
  - `components/setup/StyleSelectionStage.tsx`
  - `components/StyleLibraryDialog.tsx`
- Script pane tone/style editor
  - `components/StyleEditModal.tsx`
  - `components/StyleSelectionCard.tsx`
  - `components/StyleLibraryDialog.tsx`

## Current category audit

Current catalog size is 62 styles total, not ~64.

| Category | Count |
| --- | ---: |
| Genre Twist | 16 |
| Dialogue Rules | 16 |
| Absurd Logic | 16 |
| Vibe Focus | 14 |

Observations:

- The first three categories sit exactly at the proposed per-tab target.
- `Vibe Focus` is slightly smaller but still large enough to justify its own dedicated tab.
- No category is so small that a tab would feel empty.

## Sample line audit

- Sample dialogue already exists in the current data model.
- `stylesLibrary.ts` defines `sampleLine` as a required field on `StyleItem`.
- `styleLibrary.json` also includes `sampleLine`.
- The setup flow already displays sample lines for the currently selected style.

Conclusion: the redesign can use sample lines immediately. No data backfill is required for Phase 2.

## Current modal and layout constraints

### Shared library dialog shell

- `components/StyleLibraryDialog.tsx` renders the current library modal.
- The shell uses `max-w-2xl`, which is Tailwind’s default 42rem width, about 672px.
- The list container uses `max-h-[58vh]` and already scrolls independently from the dialog header.

### Script pane editor shell

- `components/StyleEditModal.tsx` also uses `max-w-2xl`.
- The library currently opens as a second modal on top of the style editor, using `z-library`.

### Setup flow shell

- The setup flow opens the same `StyleLibraryDialog` from `components/SetupForm.tsx`.
- Existing Playwright coverage in `tests/playwright/setup-layout-smoke.spec.ts` already verifies that the library header remains visible and the list scrolls in short viewports.

### Width recommendation

Based on the current `max-w-2xl` shell and the checked-in `tests/screenshots/phase2-baseline/style-library-dialog.png`, Option A is the safer default:

- Recommend: single-column compact cards for the shared library component.
- Reason: 672px is enough for a strong single-column browsing surface with tabs, badges, truncated description, and optional sample line treatment.
- Reason against default 2-column grid: once padding, gaps, badge text, selected states, and truncated metadata are added, each card becomes visually cramped. That risk is higher in the nested script-pane modal and on narrower viewports.

If a two-column layout is explored later, it should be guarded behind a wider breakpoint than the current dialog default.

## Current behavior that must remain stable

- Selecting a library entry must continue to update both `styleId` and `style` where the setup flow currently does so.
- Freeform custom tone text must remain supported in the script-pane surface.
- The script-pane quick-pick chips and `Shuffle` button should remain.
- The setup flow’s selected-style summary card should remain functionally intact unless explicitly redesigned as part of Phase 2.
- The normalization contract in `services/setupStyle.ts` must remain stable so server prompts and saved draft state do not regress.

## Proposed implementation approach

### Shared core

Build a shared `StyleLibrary` component and keep surface-specific wrappers:

- Shared core responsibilities
  - Search input and debounced filtering
  - Tab state
  - Filtered result derivation
  - Card rendering
  - Selected-style highlighting and scroll-into-view
  - Keyboard-accessible tab bar
- Surface wrappers
  - Setup flow keeps its current modal framing and selection callback semantics
  - Script pane keeps its chips, shuffle, and textarea, but should present the library inline inside the existing editor modal rather than opening a second modal layer

### Search behavior

- Empty search: show tabbed mode, one category at a time
- Active search: hide tabs and show a flat mixed-category result list
- Clearing search: restore the last active tab

### Card layout

- Show style name prominently
- Show category badge on every card
- Clamp description to one line in the default state
- Use sample line as a secondary preview treatment only when space allows
- Preserve the current selected state behavior with stronger visual emphasis

## Exact files expected to change in Phase 2

- `components/StyleLibraryDialog.tsx`
  - Likely split or slimmed into a wrapper around a new shared core component
- `components/StyleEditModal.tsx`
  - Replace second-modal launch behavior with inline or nested-view library presentation inside the same modal
- `components/SetupForm.tsx`
  - Keep setup selection plumbing, update wrapper integration if needed
- `components/setup/StyleSelectionStage.tsx`
  - Only if the setup-stage trigger or summary treatment needs a small adjustment
- `components/StyleSelectionCard.tsx`
  - Only if the script-pane selected-style summary needs to accommodate the inline library reveal
- `stylesLibrary.ts`
  - Only if a minimal UI helper export is needed; no content rewrites planned
- Tests
  - `tests/exportAndSetup.test.tsx`
  - `tests/scriptStyleEditor.test.tsx`
  - `tests/playwright/setup-layout-smoke.spec.ts`
  - Possibly one new focused test file for keyboard tabs or debounced search

## Constraints restated

- Preserve current style data content. No renames, no category rewrites, no description edits.
- Preserve downstream behavior after selection.
- Do not remove script-pane quick-pick chips.
- Do not remove the script-pane `Shuffle` button.
- Do not remove the script-pane `Your own tone` textarea.
- Keep changes targeted to the style-library presentation and invocation flow.
- Avoid new dependencies.

## Risks and non-goals

### Risks

- Reworking the script-pane flow from modal-on-modal to inline nested view could break focus handling if not tested carefully.
- Search-mode result rendering must still preserve the selected style across tab switches and across reopening.
- Any drift between `stylesLibrary.ts` and `styleLibrary.json` remains an existing maintenance risk; this task should not expand that problem.

### Non-goals

- No style copy changes.
- No category taxonomy rewrite in code.
- No backend prompt behavior changes.
- No setup-stage summary redesign beyond what is required to integrate the new picker.

## Validation plan for Phase 2

Targeted checks first:

- Relevant component tests for setup flow and script-pane style editing
- Any new test covering keyboard tab navigation and search mode behavior

Mandatory gates from `AGENTS.md` before completion:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

If modal structure or build behavior changes materially, also run:

- `pnpm build`

Manual verification required in Phase 2:

- Setup flow library browsing
- Script-pane tone/style modal with chips, inline library view, shuffle, and textarea
- Narrow viewport tab usability and scroll behavior

## Recommendation for review

Proceed in Phase 2 with a shared single-column `StyleLibrary` core, tabbed browsing by category, flat cross-category search results, and script-pane inline integration inside the existing tone/style modal.
