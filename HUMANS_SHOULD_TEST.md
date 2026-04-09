# Humans Should Test

Manual test cases that require signed production builds, real infrastructure,
or human judgement and cannot be automated in CI.

---

## In-App Auto-Updater

**Reference:** [`src/main/updater.ts`](src/main/updater.ts),
[`src/renderer/src/hooks/useAppUpdate.ts`](src/renderer/src/hooks/useAppUpdate.ts),
[`src/renderer/src/components/UpdateNotification.tsx`](src/renderer/src/components/UpdateNotification.tsx)

The auto-updater uses `electron-updater` (once wired - see
[`RELEASING.md`](RELEASING.md)) to check, download, install, and relaunch. It
cannot be tested in `bun run dev` mode because the updater requires packaged
builds and a real GitHub Release with an `electron-builder`-generated manifest
(`latest.yml`, `latest-mac.yml`, `latest-linux.yml`).

### Setup

1. Build a packaged release with an older version:
   ```bash
   make bump-version VERSION=0.0.1
   make package
   ```
2. Create a GitHub Release with a newer version (e.g. `v0.1.0`) so the update
   manifest is published.
3. Install and launch the older build.

### Test Cases

- [ ] **Banner appears** - After a short delay, the update banner slides down
      from the top showing the new version and changelog excerpt.
- [ ] **Update Now** - Click "Update Now" and verify the download progress bar
      fills (or shows an indeterminate shimmer if Content-Length is absent),
      then the app auto-restarts into the new version.
- [ ] **Later** - Click "Later" and verify the banner is dismissed. Quit and
      relaunch the app - the banner should reappear.
- [ ] **Skip This Version** - Click "Skip This Version" and verify the banner
      is dismissed. Quit and relaunch - the banner should **not** reappear for
      that version. (Clear `localStorage` key
      `electron-template:skipped-update-version` to reset.)
- [ ] **Dark mode** - Verify the banner styles correctly in both light and
      dark mode.
- [ ] **Error + Retry** - Simulate a network failure mid-download (e.g.
      disconnect Wi-Fi) and verify the error state appears with a "Retry"
      button that re-checks and re-downloads.
- [ ] **Error + Dismiss** - In the error state, click "Dismiss" and verify the
      banner is dismissed (same behaviour as "Later" - reappears on next
      relaunch).

---

## Packaged Build Smoke Test

`make package` produces a distributable installer for the current platform.
After packaging, run through the install → launch → uninstall flow at least
once per platform before tagging a release.

### Test Cases (per platform)

- [ ] **macOS** - `.dmg` mounts, drag-to-Applications works, launching from
      Applications opens the app, `/Applications/Electron-Template.app`
      appears in the dock with the correct icon, quitting and relaunching
      preserves window state.
- [ ] **Windows** - NSIS installer runs to completion, Start Menu entry is
      created, app launches, uninstaller removes it cleanly (no leftover
      registry entries in `HKCU\Software\Electron-Template`).
- [ ] **Linux (.AppImage)** - `chmod +x ./Electron-Template-*.AppImage && ./Electron-Template-*.AppImage`
      launches the app; icon + title bar render correctly.
- [ ] **Linux (.deb)** - `sudo dpkg -i electron-template_*.deb` installs; the
      app appears in the application menu; `sudo dpkg -r electron-template`
      removes it.

---

## Config Reload / Env Override

The config loader supports env var overrides (`DEFAULT_LLM__DEFAULT_MAX_TOKENS=50000`).
This is exercised in unit tests, but the end-to-end flow through the renderer
should be sanity-checked manually before a release.

- [ ] Set `LOGGING__VERBOSE=true` in `.env`, run `make dev`, and confirm
      verbose logs appear in the terminal.
- [ ] Confirm the `useConfig()` hook in the renderer reflects the override
      (temporarily log `config` in a component).
