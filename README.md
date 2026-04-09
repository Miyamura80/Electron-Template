# electron-template

<p align="center">
  <img src="media/banner.png" alt="Electron-Template" width="400">
</p>

<p align="center">
<b>⚛️ Agent-ergonomic opinionated Electron template</b>
</p>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#project-layout">Project Layout</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#auto-updates">Auto-Updates</a> •
  <a href="#credits">Credits</a>
</p>

<p align="center">
  <img alt="Project Version" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMiyamura80%2FElectron-Template%2Fmain%2Fpackage.json&query=%24.version&label=version&color=blue">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-f9f1e1?logo=bun">
  <img alt="Electron" src="https://img.shields.io/badge/shell-electron-47848f?logo=electron">
  <img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/Miyamura80/Electron-Template">
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/Miyamura80/Electron-Template/ci_checks.yaml?branch=main">
</p>

---

<p align="center">
  <img src="media/demo.gif" alt="Electron-Template Demo" width="600">
</p>

## Key Features

| Feature | Description |
|---------|-------------|
| **Electron + Bun** | Desktop shell with Bun as the package manager and script runner |
| **electron-vite** | Single config, three Vite builds (main / preload / renderer) with HMR |
| **React 19 + TypeScript** | Strict-mode renderer with context-isolated IPC |
| **electron-builder** | Cross-platform packaging (mac / win / linux) wired up out of the box |
| **Headless engine** | Typed command registry that runs in the main process, ready for a CLI |
| **Zod config** | YAML + env var config loaded once, projected safely to the renderer |
| **Biome / knip / jscpd** | Linting, dead-code detection, duplicate detection |
| **dependency-cruiser** | Hard boundaries: renderer can't import from `main/` or `preload/` |
| **prek** | Pre-commit hook manager |

## Quick Start

```bash
# Interactive onboarding (rename, env, hooks, media)
make onboard

# Install deps and launch the desktop app in dev mode
make all

# Run the app with hot reload
make dev

# Build production bundles (main / preload / renderer → out/)
make build

# Package a distributable for the current platform (→ release/)
make package

# Run tests
make test

# Run all CI checks (lint, deadcode, typecheck, etc.)
make ci
```

## Project Layout

```
src/
├── main/           # Electron main process (Node runtime)
│   ├── index.ts        # App lifecycle + single-instance lock
│   ├── window.ts       # BrowserWindow creation (preload wired up)
│   ├── ipc.ts          # ipcMain handlers
│   ├── updater.ts      # Update stub (swap in electron-updater)
│   ├── config/         # Zod-validated YAML + env config loader
│   ├── engine/         # Headless command registry (ping, file, system…)
│   └── utils/          # Main-process utilities (redactor, etc.)
├── preload/        # contextBridge → window.electronAPI
│   └── index.ts
├── renderer/       # React frontend (Chromium)
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── App.css
│       ├── components/     # Chat, SettingsPanel, UpdateNotification
│       └── hooks/          # useConfig, useAppUpdate
└── shared/         # Types + IPC channel constants shared across processes
resources/
└── global-config.yaml   # Source of truth for app config
```

## Configuration

All config is loaded **once** in the main process, validated with Zod, and
exposed to the renderer via a sanitized projection that strips API keys.

```typescript
// Main process
import { initConfig, getConfig } from "@main/config";

const config = initConfig({ projectRoot: app.getAppPath() });
config.defaultLlm.defaultModel;   // → "gemini/gemini-3-flash-preview"
config.window.width;              // → 800
```

```tsx
// Renderer (React)
import { useConfig } from "./hooks/useConfig";

function Chat() {
    const { config } = useConfig();
    return <span>{config?.defaultLlm.defaultModel}</span>;
}
```

**Precedence** (highest to lowest):

1. Environment variables. Use `__` for nesting, e.g.
   `DEFAULT_LLM__DEFAULT_MAX_TOKENS=50000`, `FEATURES__NEW_UI=true`,
   `WINDOW__WIDTH=1200`.
2. `.global-config.yaml` at the project root (git-ignored local override).
3. `resources/production-config.yaml` (applied when `DEV_ENV=prod`).
4. `resources/global-config.yaml` (base config).

## Engine Commands

The main process hosts a typed command registry that the renderer can call
over IPC:

```typescript
// Renderer
const result = await window.electronAPI.engineCall("system_info");
result.status;   // "pass" | "fail" | "skip" | "error"
result.data;     // { hostname, platform, cpuCount, ... }
```

Built-in commands: `ping`, `read_file`, `write_file`, `system_info`. Add
your own in `src/main/engine/built-ins/` and register them in
`built-ins/index.ts`.

## Auto-Updates

The updater ships as a **no-op stub** so the template boots without a signed
build. When you're ready to turn it on:

1. `bun add electron-updater`
2. Replace the handlers in `src/main/updater.ts` with real
   `autoUpdater.checkForUpdates()` calls and forward `download-progress`
   events via `win.webContents.send(IpcChannels.UpdaterProgress, ...)`.
3. Uncomment the `publish:` block in `electron-builder.yml`.

The renderer-side banner (`src/renderer/src/components/UpdateNotification.tsx`)
and hook (`hooks/useAppUpdate.ts`) are already wired up. Nothing to change.

## Credits

- [Electron](https://www.electronjs.org/) - Desktop shell
- [electron-vite](https://electron-vite.org/) - Three-bundle Vite config
- [Bun](https://bun.sh) - JavaScript runtime and package manager
- [Biome](https://biomejs.dev) - Linter and formatter
- [Zod](https://zod.dev) - TypeScript schema validation
- [prek](https://github.com/j178/prek) - Pre-commit hook framework
- [Fumadocs](https://fumadocs.dev) - Documentation framework

## About the Core Contributors

<a href="https://github.com/Miyamura80/Electron-Template/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Miyamura80/Electron-Template" />
</a>

Made with [contrib.rocks](https://contrib.rocks).
