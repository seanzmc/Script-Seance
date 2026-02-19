# Penpot Token Sets for Script Seance

## Styling sources confirmed

Values in `penpot-tokens.json` were derived from these existing sources:

- Tailwind utility usage in TSX components (dominant styling approach): `components/*.tsx`, `App.tsx`
- Tailwind config and font extensions: `tailwind.config.js:1-18`
- Global base styles and hardcoded colors: `index.css:5-29`
- Font loading in HTML: `index.html:8-10`
- Inline export style block (screenplay paper, typography, shadow, canvas border): `components/ScriptDisplay.tsx:38-175`
- Inline animation style block: `components/VoiceCastingModal.tsx:388-393`

No project-wide CSS variable token file is present; tokens are currently implied by Tailwind classes and a few inline hex/shadow values.

## How the token system was derived

- Spacing scale: based on most common utility usage in `docs/ui-inventory/styles.json` (`gap-2`, `py-2`, `px-3`, `px-4`, etc.) plus the previously proposed minimal scale.
- Radius scale: based on frequent `rounded-*` usage (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`).
- Shadows: compact semantic set (`shadow.sm`, `shadow.md`, `shadow.lg`) mapped to Tailwind/default usage and existing custom shadows in the app.
- Typography: `Inter` for UI and `Courier Prime` for screenplay content, with a small size/weight set from active classes and screenplay export CSS.
- Colors: semantic tokens mapped to actual current values from Tailwind palette usage and explicit hex values in `index.css` and `components/ScriptDisplay.tsx`.

## Output format notes

- Output file: `docs/ui-inventory/penpot-tokens.json`
- Top-level token sets: `Core`, `Components`
- Token naming: dot notation (for example `color.background.app`, `space.8`, `button.primary.bg`)
- Every token includes `{ "value": ..., "type": ... }` using Penpot-compatible types (`color`, `dimension`, `number`, `string`).
