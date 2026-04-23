# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Super-opinionated Electron + Bun + TypeScript desktop template. Uses `bun`
for package management and scripts; `electron-vite` orchestrates three
parallel Vite builds (main / preload / renderer) and `electron-builder`
handles cross-platform packaging.

**Before any other work in this repo, enable prek:** `bun add -g prek && prek install`. Hooks are defined in `prek.toml`.

## Common Commands

```bash
# Onboarding & Setup
make onboard        # Interactive onboarding CLI (rename, deps, env, hooks, media)
make setup          # Install dependencies (bun install)
make all            # Install deps and launch the desktop app in dev mode
make dev            # Run Electron with hot reload
make build          # Build main + preload + renderer bundles (→ out/)
make package        # Package a distributable for the current platform (→ release/)

# Testing
make test           # Run all tests (bun test)
make test_fast      # Run fast tests (5s timeout)
make test_watch     # Run tests in watch mode

# Code Quality (run after major changes)
make fmt            # Format code with Biome (auto-fix)
make lint           # Run Biome linter (check only)
make deadcode       # Find dead code + unused deps with knip
make typecheck      # Run TypeScript type checker (tsc --noEmit)
make import_lint    # Enforce module boundaries with dependency-cruiser
make lint_links     # Check for broken links in markdown files
make file_len_check # Enforce max LOC per .ts/.tsx file (see package.json fileLength)
make ci             # Run all CI checks

# Dependencies
bun install         # Install dependencies
bun add <pkg>       # Add a runtime dependency
bun add -d <pkg>    # Add a dev dependency
```

## Architecture

Three processes, one repo:

- **`src/main/`** - Electron main process (Node runtime). Owns config
  loading, window creation, IPC handlers, and the engine command registry.
  Never import from `src/renderer/`.
- **`src/preload/`** - Preload script that exposes a typed
  `window.electronAPI` to the renderer via `contextBridge`. Keep it
  minimal - new IPC endpoints should go here plus `src/main/ipc.ts`.
- **`src/renderer/`** - React 19 + TypeScript frontend (Chromium). Talks
  to the main process exclusively through `window.electronAPI`. Never
  import from `src/main/` or `src/preload/` directly (enforced by
  `dependency-cruiser`).
- **`src/shared/`** - Types and IPC channel constants shared across
  processes. Must stay free of Node-only or Electron-only imports.
- **`resources/global-config.yaml`** - Source of truth for app config.
  Copied into the packaged app by `electron-builder`.
- **`tests/`** - `bun:test` tests that import from the main process via
  the `@main/*` path alias.

## IPC Contract

1. Define a channel name in `src/shared/ipc-channels.ts`.
2. Add a handler in `src/main/ipc.ts` (or the owning module, e.g. `updater.ts`).
3. Add a typed wrapper in `src/preload/index.ts` and on the `ElectronAPI`
   interface in `src/shared/types.ts`.
4. Call it from the renderer via `window.electronAPI.myMethod()`.

Request/response calls use `ipcRenderer.invoke`; streaming events
(progress, notifications) use `webContents.send` with a matching
`ipcRenderer.on` in the preload that returns an unsubscribe function.

## Engine Commands

The engine (`src/main/engine/`) is a headless, Electron-agnostic command
registry. Add a new command:

1. Create `src/main/engine/built-ins/<name>.ts` exporting a
   `CommandDefinition`.
2. Register it in `src/main/engine/built-ins/index.ts`.
3. Write tests in `tests/engine/`.

Handlers should throw `CommandError(code, message)` for expected failures
(returns status `fail`); uncaught exceptions become status `error`.

## Code Style

- camelCase for functions/variables
- PascalCase for classes/types/interfaces/React components
- UPPER_CASE for constants
- kebab-case for file names
- 4-space indentation, double quotes (enforced by Biome)

## Configuration Pattern

Config lives in `resources/global-config.yaml`, is loaded once by
`src/main/config/loader.ts`, validated with Zod, and exposed to the
renderer as a sanitized `FrontendConfig` that **strips all API keys**.

```typescript
// Main process (once at startup)
import { initConfig, getConfig } from "@main/config";
const config = initConfig({ projectRoot: app.getAppPath() });

// Renderer
const { config } = useConfig();  // from useConfig() hook
```

Env var overrides use `__` for nesting
(`DEFAULT_LLM__DEFAULT_MAX_TOKENS=50000`). Add new config fields to
`src/main/config/schemas.ts` first - the loader rejects anything that
isn't in the schema.

## Testing Pattern

```typescript
import { describe, expect, test } from "bun:test";
import { createEngine } from "@main/engine";

describe("MyFeature", () => {
    test("pings", async () => {
        const engine = createEngine();
        const result = await engine.execute("ping");
        expect(result.status).toBe("pass");
    });
});
```

## Commit Message Convention

Use emoji prefixes indicating change type and magnitude (multiple emojis = 5+ files):
- 🏗️ initial implementation
- 🔨 feature changes
- 🐛 bugfix
- ✨ formatting/linting only
- ✅ feature complete with E2E tests
- ⚙️ config changes
- 💽 DB schema/migrations

## Post-Change Checks

After major changes, always run `make ci` and fix any issues before
committing. If `make ci` is too slow for iterative work, run at minimum:

- `make fmt` (auto-fix formatting)
- `make lint` (check for errors)
- `make typecheck` (verify types)
- `make import_lint` (enforce process boundaries)

## Subagents

- Folder-size CI failure → spawn subagent `.claude/agents/folder-refactor-advisor.md`.

## Git Workflow

- **Protected Branch**: `main` is protected. Do not push directly to `main`. Use PRs.
- **Merge Strategy**: Squash and merge.
- **Pre-commit CI gate**: Always run `make ci` before committing any
  changes. Ensure it passes with zero errors. Do not commit if
  `make ci` fails - fix all issues first, then commit.
- **Never force push**: Do not use `git push --force` or
  `--force-with-lease`. If you hit a git issue, stop and ask the user for
  guidance.

---

## Automated Translation (Jules Sync)

Docs under `docs/content/` are auto-translated by the **Jules Translation Sync**
workflow. Do NOT manually translate doc files - edit the English source and the
workflow will update all locales (`es`, `ja`, `zh`).
See [`docs/translation-guide.md`](docs/translation-guide.md) for the full
glossary, file naming conventions, and translation rules.
