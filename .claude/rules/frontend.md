# Frontend rules

Apply these rules when editing frontend code such as:

- `components/**`
- `app/**`
- `pages/**`
- `hooks/**`
- `styles/**`
- `domain/**` when it directly affects UI behavior
- `*.tsx`

## Primary goal

Make the smallest effective UI change while preserving the current architecture, ownership boundaries, and working behavior.

## Core principles

- Prefer editing an existing component over introducing a new wrapper or abstraction.
- Avoid over-containerization.
- Avoid stacking multiple visual shells around the same content.
- Reduce padding before adding more structure.
- Keep the diff reviewable.
- Preserve current naming and code style.
- Do not introduce a second design language into an existing screen.

## UI review checklist

When working on a UI task, explicitly check:

1. Does the control look interactive?
2. Is spacing helping hierarchy or just consuming space?
3. Are there unnecessary nested wrappers?
4. Is there duplicated styling logic that should be consolidated into existing patterns?
5. Are adjacent components visually coherent?
6. Is content unnecessarily hidden when a lighter disclosure pattern would work better?

## Layout guidance

- Favor fewer containers.
- Favor stronger hierarchy over more decoration.
- Avoid giant padding values unless the layout truly needs them.
- Prefer denser, clearer compositions for workspace-style interfaces.
- Let important content stay visible when practical.
- For secondary content, prefer a small reveal pattern over another permanent panel.

## Interaction guidance

- Buttons should read as buttons.
- Menus, toggles, disclosures, and tabs should be visually distinct from static text.
- Hover/focus/active states should remain coherent with the existing design language.
- Do not make interactive affordances subtle to the point of ambiguity.

## Component rules

- Preserve ownership of state where it currently lives unless the task explicitly requires restructuring.
- Do not move logic across multiple files unless there is a clear payoff.
- Keep prop surfaces tight.
- Prefer existing primitives and patterns before creating new shared ones.
- Avoid “helper” components that only wrap one use site unless they materially simplify the code.

## Styling rules

- Reuse current tokens, classes, utilities, and component conventions.
- Avoid one-off styling systems that compete with neighboring UI.
- Prefer local cleanup over broad theme rewrites.
- If a style issue can be fixed by deleting classes instead of adding more, prefer deletion.

## Task workflow

For non-trivial UI tasks:

1. Inspect the target component.
2. Inspect the nearest parent or sibling that controls layout or visual language.
3. Classify the issue as:
   - styling-only
   - structure-only
   - logic-linked
4. Propose the smallest patch that solves the actual problem.

## Frontend validation

- For browser-visible changes, do not claim the UI is fully cleared from code inspection alone.
- Include a short manual verification checklist when visual behavior matters.
- When interaction states are part of the task, check enabled, disabled, hover, and focus-visible states explicitly.

## What to avoid

- Unasked-for redesigns
- New dependencies for simple UI work
- Rewriting stable wiring just to make a component “cleaner”
- Replacing working patterns with speculative abstractions
- Inflating the component tree with cosmetic wrappers

## Expected output format

- Diagnosis
- Files inspected
- Patch plan
- Risks
- Patch summary
- Validation
