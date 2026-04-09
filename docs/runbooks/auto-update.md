# Auto-Update Runbook

The template ships with a `src/main/updater.ts` that is **off by default**.
It returns `null` for update checks and throws if you try to download, so
unsigned dev builds run without any publishing infrastructure.

This runbook walks through enabling real updates backed by
[`electron-updater`](https://www.electron.build/auto-update). The flow works
for GitHub Releases, S3, generic HTTP servers, and any other provider
supported by `electron-builder`.

## 1. Install the package

`electron-updater` is an **optional** dependency of this template; install
it only when you're ready to ship updates.

```bash
bun add electron-updater
```

`src/main/updater.ts` uses a dynamic `import("electron-updater")` guarded by
a `.catch(() => null)`, so the template still builds if the package is
missing. Once installed, the dynamic import resolves at runtime.

## 2. Turn the updater on

The updater is gated by an environment variable so you can toggle it per
build without editing code:

```bash
# In your packaged-app launcher, CI, or electron-builder config
UPDATER_ENABLED=true
```

When `UPDATER_ENABLED` is anything other than `"true"`, `checkForUpdate()`
short-circuits and returns `null` - the renderer banner stays hidden.

## 3. Configure a publish target

Edit `electron-builder.yml` and add a `publish` section. The simplest option
is GitHub Releases:

```yaml
publish:
  provider: github
  owner: your-github-user-or-org
  repo: your-repo-name
  releaseType: release
```

Other providers: `s3`, `spaces`, `generic`, `snapStore`, `bintray`.
See the [electron-builder publish docs](https://www.electron.build/configuration/publish)
for the full list.

## 4. Build and publish a release

```bash
# One-off local build (no publish)
bun run package

# Publish to the configured provider. electron-builder will read
# GH_TOKEN / AWS_* / etc. from the environment.
GH_TOKEN=ghp_xxx bun run package -- --publish always
```

The first release becomes the "latest" version. Subsequent releases with a
higher `version` in `package.json` will be picked up automatically by
`autoUpdater.checkForUpdates()`.

## 5. Test the flow

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.1.1`).
2. Build and publish.
3. Install an older build locally.
4. Launch it with `UPDATER_ENABLED=true`. The update notification banner
   should appear within a few seconds; clicking "Update Now" downloads
   the new build and relaunches the app.

### Progress events

While the download is in flight, `src/main/updater.ts` forwards
`electron-updater`'s `download-progress` events over the
`IpcChannels.UpdaterProgress` channel. The renderer's
`useAppUpdate()` hook subscribes to them via
`window.electronAPI.updater.onProgress()` and updates the progress bar.

### Errors

Updater errors are logged via the structured logger (scope `updater`) and
also re-thrown so the renderer can surface them to the user via the
`UpdateNotification` banner. Anything that lands in
`process.on('uncaughtException')` is additionally captured by the crash
reporter (see [`crash-reporter.md`](./crash-reporter.md)).

## 6. Code signing

macOS and Windows require code signing for auto-updates to work. Without
valid signatures:

- **macOS**: Gatekeeper blocks the downloaded bundle and the update fails
  silently.
- **Windows**: the installer still runs but SmartScreen warns users on
  first launch.

See `electron-builder`'s
[code signing docs](https://www.electron.build/code-signing) for the full
setup. For CI, store the cert + password in GitHub Secrets and expose them
as `CSC_LINK` / `CSC_KEY_PASSWORD`.

## 7. Rolling back

There is no native rollback in `electron-updater`. If a release is bad,
publish a **new** release with a higher version that reverts the changes.
Clients will auto-update to the fix on their next check.

For emergencies you can also **delete** the bad GitHub release - clients
that haven't updated yet will stop seeing it as "latest", but clients that
already updated will stay on the bad build until the next release ships.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `checkForUpdate` always returns `null` | `UPDATER_ENABLED` unset or `false` | Set `UPDATER_ENABLED=true` |
| "electron-updater is not installed" error | Package not installed | `bun add electron-updater` |
| Update downloads but doesn't apply | Missing code signature | See step 6 |
| `404` on update metadata | `publish` config mismatch | Verify `owner`/`repo` in `electron-builder.yml` |
| Progress bar stuck at 0% | Event listener attached too late | Make sure `registerUpdaterHandlers(win)` runs before the first check |
