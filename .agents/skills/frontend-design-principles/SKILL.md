---
name: frontend-design-principles
description: Core visual principles for frontend work - subtract text, prefer SVG over prose, detail behind summary, one CTA. Use when building or editing UI, React components, pages, dashboards, docs or marketing sections, modals, or reviewing a frontend diff.
---

# Frontend design principles

Apply to every UI change.

**1. Subtract.** "Perfection is when there is nothing left to subtract." Before
adding anything, delete something: helper text, headings, borders, badges,
duplicated labels.

**2. A picture beats a thousand words.** If an icon or diagram can say it, don't
write the paragraph. Reuse below first, then https://svgl.app or
https://eito.me/icons. Inline it.

**3. Detail → summary.** Show the summary only; reveal detail on hover, click,
or expand. Never dump the full record upfront. Hover alone never counts: the
same detail must open by keyboard and by touch, so lean on native
`details`/`summary` or a real button before inventing a hover affordance.

**4. Keep the main thing the main thing.** Exactly one CTA per view, with the
only high-contrast treatment on screen. Everything else stays dull, so contrast
itself points the eye. Same CTA color, shape, and placement app-wide.

## Reuse before creating

**Renderer (React 19 + Vite), `src/renderer/src/`**

- Components: `components/Chat.tsx`, `SettingsPanel.tsx`,
  `UpdateNotification.tsx`, `ErrorBoundary.tsx`. `Chat.tsx` inlines its marks as
  JSX with `stroke="currentColor"`, and hides them with `aria-hidden="true"`
  only because each enclosing button carries its own `aria-label`. Copy both
  halves of that pattern: hide the SVG only when the name lives on the control.
  An icon that carries meaning by itself needs `role="img"` plus a `<title>`.
  Do not add an icon package for a handful of marks.
- Every rule and animation lives in `App.css`, including the keyframes
  `message-in`, `typing-bounce`, `update-banner-slide-in`, and
  `update-indeterminate`. Reuse an existing keyframe before writing a new one,
  and keep new rules in that file rather than inline styles.
- The renderer must never import from `src/main/` or `src/preload/`
  (`dependency-cruiser` enforces this in `make import_lint`). Anything the UI
  needs arrives over `window.electronAPI`; adding data to a view means adding an
  IPC channel first, per the IPC contract in `CLAUDE.md`.
- Config reaches the UI as the sanitized `FrontendConfig` via the `useConfig()`
  hook in `hooks/useConfig.ts`. API keys are stripped, so never render them.

**Docs (Next.js + Fumadocs), `docs/`**

- Shared page chrome: `components/ai/page-actions.tsx`,
  `lib/layout.shared.tsx`.
- There is no icon registry yet. To add sidebar icons, create
  `components/icons.tsx` with inline SVG components and resolve them from an
  `icon()` handler in `lib/source.ts`, keyed off each page's `icon:`
  frontmatter. Ship the mark in the bundle; never hot-link an external asset.
