# Releasing

This document explains how to release a new version of the Electron app for
distribution.

## Overview

Pushing a `v*` git tag triggers the [Release workflow](.github/workflows/release.yml),
which:

1. Builds the app on all three platforms in parallel
2. Produces installers per platform (see table below) via `electron-builder`
3. Creates a GitHub Release and attaches the installers as assets
4. Generates a `latest.yml` / `latest-mac.yml` / `latest-linux.yml` updater
   manifest so existing users can be notified in-app (once `electron-updater`
   is wired up - see [`src/main/updater.ts`](src/main/updater.ts))

| Platform | Artifact(s) |
|----------|-------------|
| macOS    | `.dmg`, `.zip` |
| Windows  | `.exe` (NSIS installer) |
| Linux    | `.AppImage`, `.deb` |

---

## One-Time Setup

### 1. Customize `electron-builder.yml`

Edit [`electron-builder.yml`](electron-builder.yml):

- `appId` - reverse-DNS identifier, e.g. `com.example.my-app`
- `productName` - display name shown in the installer, dock, Start menu
- `publish` - uncomment and fill in the GitHub owner/repo for auto-update

### 2. macOS Code Signing & Notarization (optional but recommended)

Without signing, macOS Gatekeeper will warn users on first launch. To sign:

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Export your **Developer ID Application** certificate as a `.p12` file
3. Add the following secrets to your GitHub repository settings:

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded `.p12` file (`base64 -i cert.p12`) |
| `CSC_KEY_PASSWORD` | `.p12` export password |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | Your 10-character team ID |

`electron-builder` reads these automatically during the release build.

### 3. Windows Code Signing (optional)

Without signing, Windows SmartScreen will warn users. To sign:

1. Obtain an **EV Code Signing certificate** from a trusted CA (DigiCert, Sectigo, etc.)
2. Add secrets:

| Secret | Value |
|--------|-------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` file |
| `WINDOWS_CERTIFICATE_PASSWORD` | `.pfx` export password |

Unsigned builds still work - users click through the SmartScreen warning once.

---

## Release Workflow

### Step 1 - Bump versions

```bash
make bump-version VERSION=1.2.0
```

This updates `package.json` atomically and prints the suggested commit / tag
commands.

### Step 2 - Commit and tag

```bash
git add package.json
git commit -m "⚙️ bump version to 1.2.0"
git tag v1.2.0
git push origin main --tags
```

### Step 3 - Watch CI

The [Release workflow](.github/workflows/release.yml) triggers automatically.
Check the **Actions** tab for build progress. All three platforms build in
parallel.

### Step 4 - Verify the release

Once CI completes, visit **Releases** on GitHub:

- Confirm all platform installers are attached
- Confirm the updater manifest files (`latest.yml`, `latest-mac.yml`,
  `latest-linux.yml`) are present if you have auto-update configured
- Edit the release notes if desired, then publish

---

## How the Auto-Updater Works

The template ships with a no-op updater stub at
[`src/main/updater.ts`](src/main/updater.ts). To enable real auto-updates:

1. `bun add electron-updater`
2. Replace `checkForUpdate()` in `src/main/updater.ts` with a call to
   `autoUpdater.checkForUpdates()`
3. Wire `autoUpdater`'s `download-progress` events into
   `win.webContents.send(IpcChannels.UpdaterProgress, ...)`
4. Configure `publish` in `electron-builder.yml`

Once wired, the frontend uses the existing `useAppUpdate` hook at
[`src/renderer/src/hooks/useAppUpdate.ts`](src/renderer/src/hooks/useAppUpdate.ts)
to handle the full check → download → install flow.

On startup (after a short delay), the hook calls `check()` via IPC. If a newer
version is found, an in-app banner appears with three options:

- **Update Now** - downloads and installs the update, showing a progress bar.
  The app auto-restarts once installation completes.
- **Later** - dismisses the banner for the current session. Reappears on the
  next launch.
- **Skip This Version** - persists the version to `localStorage`, permanently
  suppressing the notification for that specific version.

The updater manifest is fetched from the endpoint configured in
`electron-builder.yml` under `publish` (typically the GitHub Releases page).

---

## Testing the Updater Locally

The updater **cannot be tested in `bun run dev` mode** - it requires packaged
builds and a real GitHub Release. To test end-to-end:

1. Build a release with an older version:
   ```bash
   make bump-version VERSION=0.0.1
   make package
   ```
2. Create a GitHub Release with a newer version (e.g. `v0.1.0`)
3. Install and launch the older build
4. The update banner should appear after a short delay
5. Click **Update Now** and verify the download progress + restart

For UI development without a real update, you can temporarily mock the
`check()` call in `useAppUpdate.ts` to return a fake update object.

See [`HUMANS_SHOULD_TEST.md`](HUMANS_SHOULD_TEST.md) for the full manual QA
checklist before shipping a release.

---

## Pre-release / Beta

To publish a pre-release without triggering the auto-updater for stable users:

1. Use a pre-release version number:
   `make bump-version VERSION=1.3.0-beta.1`
2. Tag: `git tag v1.3.0-beta.1 && git push origin v1.3.0-beta.1`
3. After CI completes, edit the GitHub Release and check **This is a
   pre-release**

Pre-release assets are not served by `electron-updater`'s default channel, so
stable users will not be prompted to update.
