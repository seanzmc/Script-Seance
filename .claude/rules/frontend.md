---
paths:
  [
    "components/**",
    "app/**",
    "pages/**",
    "hooks/**",
    "styles/**",
    "domain/**",
    "*.tsx",
  ]
---

# Frontend rules

Script Seance is a dense writing workspace. Adjacent panes must feel like one product.

## Scope model

Always in scope: the targeted element, its full interaction state, same-role siblings in the same pane, local layout/styling sources, conflicting class/style systems affecting it, and obvious visual inconsistency exposed by the fix in that same area.

Usually in scope: nearest parent container if it controls layout or hierarchy, local shared constants/classes used only by that area, adjacent spacing or copy needed to make the element read correctly.

Out of scope unless explicitly requested: broad screen redesign, app-wide design system refactors, unrelated components in other panes or flows, speculative abstractions.

## Interaction-state rule

Treat hover, active, focus-visible, disabled, motion, color, border, shadow, and emphasis as one interaction system. Do not stop at fixing a single sub-state if the control still feels inconsistent in context. For same-role controls in the same pane, aim for coherent behavior across the full set.

## Layout and styling

Reduce padding before adding structure. Favor fewer containers, stronger hierarchy over decoration, and denser compositions for workspace interfaces. If a style issue can be fixed by deleting classes instead of adding more, prefer deletion. If an element is styled by two competing systems, resolve the ownership conflict instead of layering overrides.

Reuse current tokens, classes, and utilities. Do not introduce a second design language into an existing screen.

## Component discipline

Prefer editing an existing component over introducing a new wrapper. Keep state ownership where it currently lives unless the task explicitly requires restructuring. If a shared component is fighting the local UI task, prefer a local fix before escalating into shared-component refactor.

## Completion standard

A UI task is not complete if the named symptom is fixed but the same control still feels visibly inconsistent, or same-role controls in the same pane behave differently for the same interaction state. For browser-visible changes, include a short manual verification checklist covering enabled, disabled, hover, focus-visible, and active states when relevant.
