---
name: onboarding
description: Interview the user, inspect this Electron/Bun/TypeScript template, run the interactive onboarding CLI, and rebrand unused pieces so a new desktop project gets running quickly.
---

# Onboarding

Use this skill when the user wants to turn this template into a real project,
especially when they invoke `/onboarding`, ask to run onboarding, or want to
rename and configure the template for their own app.

`onboard.ts` at the repo root is the source of truth for every onboarding
step, default, and file it rewrites. Read it before changing anything. Its
`orchestrator()` and the `cmd*` subcommands (`cmdRename`, `cmdDeps`, `cmdEnv`,
`cmdHooks`, `cmdMedia`) define what runs and in what order; the `DEFAULT_NAME`,
`DEFAULT_DISPLAY_NAME`, `DEFAULT_DESCRIPTION`, and `filesToUpdate` constants
define exactly what the rename touches.

This template has **no headless prune system** — unlike some sibling templates
there is no `make init` that deletes surfaces. Onboarding is interactive
branding + setup only. Treat any file removal as a manual, user-confirmed step.

## Workflow

1. Inspect the repo before changing anything:
   - `CLAUDE.md` / `AGENTS.md`, `package.json`, `Makefile`, `README.md`
   - `onboard.ts` — the step orchestration and the rename rewrite list
     (`README.md`, `src/main/index.ts`, `resources/global-config.yaml`,
     `electron-builder.yml`, `scripts/README.md`)
   - The three processes so you know what "the app" is: `src/main/` (Electron
     main, Node runtime — config loading, windows, IPC, engine registry),
     `src/preload/` (typed `window.electronAPI` bridge), `src/renderer/`
     (React 19 + Vite UI), `src/shared/` (cross-process types + IPC channels)
   - Config: `resources/global-config.yaml` (source of truth), loaded and
     validated with Zod in `src/main/config/` — `schemas.ts` is the allow-list,
     and the sanitized `FrontendConfig` strips API keys before the renderer
     sees it
   - `.env.example` (the keys onboarding offers to fill), `prek.toml` (hooks)

2. Interview the user briefly before running anything. Ask which steps they
   want; the five are independent and each can be skipped:
   - **rename** — project name (kebab-case), description, GitHub `owner/repo`
     for badge URLs. Rewrites `package.json` + the `filesToUpdate` set. Skips
     itself if the project was already renamed away from `electron-template`.
   - **deps** — `bun install`.
   - **env** — multiselect keys from `.env.example`, writes `.env`
     (git-ignored). Secret-looking keys (`_KEY`, `TOKEN`, `SECRET`, …) are
     prompted with a masked input.
   - **hooks** — installs `prek` globally and runs `prek install`.
   - **media** — generates banner/logo via the Gemini scripts; **requires
     `GEMINI_API_KEY`** in `.env` or the environment, and is fine to skip.

3. Run onboarding. `make onboard` launches the full interactive flow
   (`bun run onboard.ts`); the orchestrator asks "Run <step>?" before each one.
   To run a single step non-interactively use the subcommand directly:
   - `bun run onboard.ts rename`
   - `bun run onboard.ts deps`
   - `bun run onboard.ts env`
   - `bun run onboard.ts hooks`
   - `bun run onboard.ts media`
   - `bun run onboard.ts --help` lists them.
   The CLI is idempotent-ish (rename self-skips once renamed); re-running a
   step is safe. It never commits or pushes.

4. Verify the app actually runs after setup:
   - `make dev` — launch Electron with hot reload; confirm the window opens and
     the renderer talks to main over `window.electronAPI` (e.g. the `ping`
     engine command round-trips).
   - `make build` — build main + preload + renderer bundles into `out/`.
   - `make test` — `bun:test` suite (engine + IPC).
   - `make ci` — full gate (lint, deadcode, typecheck, import_lint, lint_links,
     file_len_check, and the writing/tech-debt checks). Run this before the
     user's first commit.

5. Handle what onboarding does NOT touch, only after confirming with the user:
   - Adding a new engine command: `src/main/engine/built-ins/<name>.ts`,
     register in `built-ins/index.ts`, test in `tests/engine/`.
   - Adding an IPC endpoint: channel in `src/shared/ipc-channels.ts`, handler
     in `src/main/ipc.ts`, typed wrapper in `src/preload/index.ts` +
     `ElectronAPI` in `src/shared/types.ts`.
   - New config fields: add to `src/main/config/schemas.ts` first (the loader
     rejects anything not in the schema).
   - Packaging identity (`electron-builder.yml` appId, publish targets) and
     release workflows (`.github/workflows/`) — update or remove to match the
     real app; rename only rewrites the display name, not signing/publish setup.
   - `docs/` (Next.js/Fumadocs, separate dependency tree) — rebrand or drop
     manually if unused.

## Guardrails

- Interview first; never run a mutating step the user did not ask for.
- Do not delete `docs/`, packaging config, release workflows, or any process
  directory without explicit user confirmation — there is no automated prune,
  so every removal is a deliberate manual edit.
- Add new config fields to `src/main/config/schemas.ts` before referencing
  them; never widen `FrontendConfig` in a way that leaks secrets to the
  renderer (the sanitizer is a security boundary).
- `.env` holds secrets and is git-ignored — keep real keys out of committed
  files, including `resources/global-config.yaml`.
- Do not push to `main`, force-push, or run destructive git commands.
- Run `make ci` and fix all issues before the user commits.
