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

Complete the smallest coherent UI fix, not just the smallest literal code change.

Preserve architecture, ownership boundaries, and working behavior, while allowing enough scope to finish the local design/interaction problem in one pass.

## Core principles

- Prefer editing an existing component over introducing a new wrapper or abstraction.
- Avoid over-containerization.
- Avoid stacking multiple visual shells around the same content.
- Reduce padding before adding more structure.
- Keep the diff reviewable.
- Preserve current naming and code style.
- Do not introduce a second design language into an existing screen.
- Prefer a complete local polish pass over a symptom-only patch when the surrounding inconsistency is obvious and directly related.

## Scope model for UI tasks

When working on a UI issue, use this scope boundary:

### Always in scope

- the targeted control or element
- its full interaction state
- same-role sibling controls in the same pane/section
- local layout/styling sources that directly define its behavior
- conflicting class/style systems affecting that element
- obvious visual inconsistencies exposed by the requested fix in that same area

### Usually in scope

- nearest parent container if it controls hierarchy, spacing, or affordance
- local shared constants/classes used only by that area
- adjacent copy or spacing if needed to make the element read correctly

### Out of scope unless explicitly requested

- broad screen redesign
- app-wide design system refactors
- unrelated components in other panes or flows
- speculative abstraction work
- global cleanup not required to complete the local UI task

## UI review checklist

When working on a UI task, explicitly check:

1. Does the control look interactive?
2. Is spacing helping hierarchy or just consuming space?
3. Are there unnecessary nested wrappers?
4. Is there duplicated styling logic that should be consolidated into existing patterns?
5. Are adjacent components visually coherent?
6. Is content unnecessarily hidden when a lighter disclosure pattern would work better?
7. Is the requested fix exposing a second obvious inconsistency in the same local area?
8. Is the control being styled by more than one competing class system?

## Interaction-state rule

Treat hover, active, focus-visible, disabled, motion, color, border, shadow, and emphasis as one interaction system.

Do not stop at fixing a single sub-state if the control still feels visibly inconsistent in the same local context.

For controls of the same role in the same pane, aim for coherent interaction behavior across the full set.

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
- If multiple same-role controls in one area feel like different products, unify them locally.
- Fix the full hover/focus/active behavior for the target area rather than only the specifically named symptom.

## Component rules

- Preserve ownership of state where it currently lives unless the task explicitly requires restructuring.
- Do not move logic across multiple files unless there is a clear payoff.
- Keep prop surfaces tight.
- Prefer existing primitives and patterns before creating new shared ones.
- Avoid “helper” components that only wrap one use site unless they materially simplify the code.
- If a shared component is fighting the local UI task, prefer a local ownership fix before escalating into shared-component refactor.

## Styling rules

- Reuse current tokens, classes, utilities, and component conventions.
- Avoid one-off styling systems that compete with neighboring UI.
- Prefer local cleanup over broad theme rewrites.
- If a style issue can be fixed by deleting classes instead of adding more, prefer deletion.
- If an element is being styled by two competing systems, resolve the ownership conflict instead of layering more overrides.
- Favor one coherent local style source over stacked conflicting utilities.

## Task workflow

For non-trivial UI tasks:

1. Inspect the target component.
2. Inspect the nearest parent or sibling that controls layout or visual language.
3. Inspect any shared local styling source directly affecting the target.
4. Classify the issue as:
   - styling-only
   - structure-only
   - logic-linked
   - mixed interaction-state
   - conflicting style ownership
5. Propose the smallest coherent patch that fully resolves the local issue.

## Completion rule

A UI task is not complete if:

- the named symptom is fixed
- but the same control still feels visibly inconsistent
- or same-role controls in the same pane still behave differently for the same interaction state
- or the fix leaves behind an obvious local styling conflict

Prefer one complete local pass over multiple tiny corrective passes.

## Frontend validation

- For browser-visible changes, do not claim the UI is fully cleared from code inspection alone.
- Include a short manual verification checklist when visual behavior matters.
- When interaction states are part of the task, check enabled, disabled, hover, focus-visible, and active states explicitly.
- If the task involves same-role controls, verify consistency across the affected set, not just one element.

## What to avoid

- Unasked-for redesigns
- New dependencies for simple UI work
- Rewriting stable wiring just to make a component “cleaner”
- Replacing working patterns with speculative abstractions
- Inflating the component tree with cosmetic wrappers
- Stopping at a symptom fix when the local interaction/design problem is still clearly unfinished

## Expected output format

### Diagnosis

### Files inspected

### Patch plan

### Risks

### Patch summary

### Validation
