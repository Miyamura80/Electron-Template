# electron-template

<p align="center">
  <img src="media/banner.png" alt="Electron-Template" width="400">
</p>

<p align="center">
  <img alt="Project Version" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMiyamura80%2FElectron-Template%2Fmain%2Fpackage.json&query=%24.version&label=version&color=blue">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-f9f1e1?logo=bun">
  <img alt="Electron" src="https://img.shields.io/badge/shell-electron-47848f?logo=electron">
  <img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/Miyamura80/Electron-Template">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/Miyamura80/Electron-Template/ci_checks.yaml?branch=main">
</p>

A super-opinionated Electron + Bun + TypeScript desktop template with three-process boundaries enforced at the import level, a Zod-validated config pipeline, and a headless engine command registry. Built with coding agents in mind as first-class users -- `make onboard` is the entire setup.

Once happy → `make package` produces a signed-ready distributable for your platform.

---

## ⚠️ Beta

This template is pre-1.0. Directory layout, IPC channel names, and engine command signatures may change between minor versions. Pin a commit if you're building on top of it.

---

## Features

- **⚛️ Three-process split** -- `main` / `preload` / `renderer` wired by `electron-vite`, with `dependency-cruiser` enforcing that the renderer never imports Node code.
- **🔒 Zod config pipeline** -- YAML source of truth, env var overrides, sanitized projection to the renderer that strips API keys. See [`resources/global-config.yaml`](resources/global-config.yaml).
- **🧠 Headless engine** -- typed command registry in `src/main/engine/` that runs independently of Electron, ready for a CLI or automation entry point.
- **📦 electron-builder** -- cross-platform packaging for mac / win / linux, configured via [`electron-builder.yml`](electron-builder.yml).
- **🧪 Bun-native tests** -- `bun:test` with `@main/*` path alias so tests import main-process code directly.
- **✨ CI gate out of the box** -- Biome, knip, jscpd, `tsc --noEmit`, dependency-cruiser, link checker, AI-writing detector, file-length check. One target: `make ci`.

See [`CLAUDE.md`](CLAUDE.md) for the full architectural contract.

---

## Workflows

### Workflow 1: First run → dev → ship

1. `make onboard` -- interactive CLI renames the project, writes `.env`, installs prek hooks, and regenerates media.
2. `make all` -- installs deps and launches the desktop app with hot reload.
3. Iterate on `src/renderer/` and `src/main/`. electron-vite reloads each process independently.
4. `make ci` before committing.
   1. → if ✅ → `git commit` with the emoji convention from [`CLAUDE.md`](CLAUDE.md#commit-message-convention)
   2. → if ❌ → fix the failing check (usually `make fmt` auto-repairs formatting / lint)
5. `make package` -- writes a distributable to `release/`.

### Workflow 2: Add an IPC endpoint

1. Add a channel constant to [`src/shared/ipc-channels.ts`](src/shared/ipc-channels.ts).
2. Add a handler in [`src/main/ipc.ts`](src/main/ipc.ts) (or the owning module -- see `updater.ts` for a streaming example).
3. Add a typed wrapper in [`src/preload/index.ts`](src/preload/index.ts) and the matching field on `ElectronAPI` in [`src/shared/types.ts`](src/shared/types.ts).
4. Call it from the renderer via `window.electronAPI.myMethod()`.
5. `make import_lint && make typecheck`.
   1. → if ✅ → write a `bun:test` covering the main-process handler
   2. → if ❌ → a boundary violation means the renderer is reaching into `main/` or `preload/` directly -- re-route through `shared/`

### Workflow 3: Add an engine command

1. Create `src/main/engine/built-ins/<name>.ts` exporting a `CommandDefinition`.
2. Register it in [`src/main/engine/built-ins/index.ts`](src/main/engine/built-ins/index.ts).
3. Write a test in `tests/engine/` against `createEngine()`.
4. `make test`.
   1. → if ✅ → the command is now callable via `window.electronAPI.engineCall("<name>")`
   2. → if ❌ → throw `CommandError(code, message)` for expected failures so the result surfaces as status `fail` instead of `error`

---

## Requirements

TLDR: Bun, plus `jq` if you plan to run the Ralph agent loop.

<details>
<summary>Expand</summary>

| Tool | Why | Install |
|------|-----|---------|
| `bun` | Package manager + script runner | [bun.sh](https://bun.sh) |
| `jq` | Only needed for `make ralph` | `brew install jq` |
| `prek` | Pre-commit hook manager, installed by `make setup_githooks` | auto |

Node is not required. `electron-vite` and `electron-builder` run under Bun.

</details>

---

## Installation

TLDR: `git clone`, then `make onboard`.

<details>
<summary>Expand</summary>

```bash
git clone https://github.com/Miyamura80/Electron-Template.git
cd Electron-Template
make onboard    # rename, env, hooks, media
make all        # install deps and launch
```

`make onboard` is idempotent -- run it again later to regenerate the banner or re-install hooks.

</details>

---

## Make Commands

TLDR: `make help`.

<details>
<summary>Expand</summary>

| Target | Description |
|--------|-------------|
| `make onboard` | Interactive onboarding CLI (rename, deps, env, hooks, media) |
| `make all` | Install deps and launch the desktop app in dev mode |
| `make dev` | Run Electron with hot reload |
| `make build` | Build main + preload + renderer bundles → `out/` |
| `make package` | Package a distributable for the current platform → `release/` |
| `make test` | Run all `bun:test` tests |
| `make test_fast` | Run tests with a 5s timeout |
| `make test_watch` | Watch mode |
| `make fmt` | Biome format (auto-fix) |
| `make lint` | Biome check only |
| `make deadcode` | knip: dead code + unused deps |
| `make typecheck` | `tsc --noEmit` |
| `make import_lint` | dependency-cruiser: enforce process boundaries |
| `make file_len_check` | Enforce max LOC per `.ts`/`.tsx` file |
| `make ci` | Run every CI check |

</details>

---

## Configuration

TLDR: YAML + env vars → Zod → frozen config. Renderer gets a sanitized copy with zero secrets.

<details>
<summary>Expand</summary>

Config is loaded **once** in the main process and exposed to the renderer via a sanitized `FrontendConfig` that strips all API keys. Add new fields to [`src/main/config/schemas.ts`](src/main/config/schemas.ts) first -- the loader rejects anything not in the schema.

```yaml
# resources/global-config.yaml
model_name: gemini/gemini-3-flash-preview   # Default model used across the app
dev_env: dev                                // "dev" | "prod" -- prod applies production-config.yaml overlay

window:
  title: Electron-Template                  # Window title + dock label
  width: 800                                # Initial width in px
  height: 600                               # Initial height in px
  min_width: 480                            # Enforced minimum
  min_height: 360

default_llm:
  default_model: gemini/gemini-3-flash-preview
  fallback_model: gemini/gemini-2.5-flash-preview
  default_temperature: 0.5                  # 0..1
  default_max_tokens: 100000

features:
  new_ui: false                             # Override with FEATURES__NEW_UI=true
  enable_llm_fallback: true                 # Flip to false to disable fallback_model
```

**Precedence** (highest to lowest):

| Source | Purpose |
|--------|---------|
| Environment variables (`DEFAULT_LLM__DEFAULT_MAX_TOKENS=50000`) | Per-invocation overrides; `__` separates nesting |
| `.global-config.yaml` at project root | Git-ignored local override |
| `resources/production-config.yaml` | Applied when `DEV_ENV=prod` |
| `resources/global-config.yaml` | Base config (the block above) |

Usage from the main process:

```typescript
import { initConfig, getConfig } from "@main/config";
const config = initConfig({ projectRoot: app.getAppPath() });
```

Usage from the renderer:

```tsx
const { config } = useConfig();
config?.defaultLlm.defaultModel;
```

</details>

---

## Architecture

TLDR: Three Vite builds, one IPC bridge, one config projection.

<details>
<summary>Expand</summary>

```
┌────────────────────────────────────────────────────────────────┐
│                       electron-vite                            │
│                                                                │
│  ┌────────────┐       ┌────────────┐       ┌──────────────┐    │
│  │    main    │       │  preload   │       │   renderer   │    │
│  │   (Node)   │◀─IPC─▶│contextBridge│◀────▶│ React 19/Vite│    │
│  └─────┬──────┘       └────────────┘       └──────────────┘    │
│        │                                                       │
│        ├─ engine/        headless command registry             │
│        ├─ config/        YAML + env → Zod → FrontendConfig     │
│        ├─ ipc.ts         ipcMain.handle(*) router              │
│        └─ updater.ts     auto-update stub (swap in real impl)  │
│                                                                │
│  shared/  types + IPC channel constants (no Node, no DOM)      │
└────────────────────────────────────────────────────────────────┘

       ▲                                          ▲
       │                                          │
   bun:test                                electron-builder
 (imports @main/*)                         (→ release/<platform>)
```

Hard rules (enforced by `dependency-cruiser`):

| From | Can import | Cannot import |
|------|------------|----------------|
| `renderer/` | `shared/` | `main/`, `preload/` |
| `main/` | `shared/` | `renderer/` |
| `preload/` | `shared/` | `renderer/` |
| `shared/` | nothing Node-only or DOM-only | -- |

</details>

---

## Auto-Updates

TLDR: Ships as a no-op stub so the template boots without signing. Wire it up when you're ready.

<details>
<summary>Expand</summary>

The renderer-side banner ([`UpdateNotification.tsx`](src/renderer/src/components/UpdateNotification.tsx)) and hook (`useAppUpdate.ts`) are already wired up. To enable real updates:

1. `bun add electron-updater`
2. Replace the handlers in [`src/main/updater.ts`](src/main/updater.ts) with real `autoUpdater.checkForUpdates()` calls and forward `download-progress` events via `win.webContents.send(IpcChannels.UpdaterProgress, ...)`.
3. Uncomment the `publish:` block in [`electron-builder.yml`](electron-builder.yml).

</details>

---

## File Artifacts

TLDR: `out/` is built bundles, `release/` is the packaged app.

<details>
<summary>Expand</summary>

```
out/
├── main/            # Compiled main process
├── preload/         # Compiled preload bundle
└── renderer/        # Compiled renderer (index.html + assets)

release/
└── <platform>/      # electron-builder output (.dmg, .exe, .AppImage, ...)

.global-config.yaml  # Git-ignored local config override (optional)
```

</details>

---

## Credits

- [Electron](https://www.electronjs.org/) -- desktop shell
- [electron-vite](https://electron-vite.org/) -- three-bundle Vite config
- [Bun](https://bun.sh) -- runtime and package manager
- [Biome](https://biomejs.dev) -- linter and formatter
- [Zod](https://zod.dev) -- schema validation
- [prek](https://github.com/j178/prek) -- pre-commit hook framework
- [Fumadocs](https://fumadocs.dev) -- documentation framework

## Contributors

<a href="https://github.com/Miyamura80/Electron-Template/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Miyamura80/Electron-Template" />
</a>

Made with [contrib.rocks](https://contrib.rocks).
