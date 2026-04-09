# Crash Reporter Runbook

`src/main/utils/crash-reporter.ts` installs three layers of crash plumbing:

1. **Electron `crashReporter`** - native C++ crash dumps (main + child
   processes). Always on, writes locally.
2. **`process.on('uncaughtException' | 'unhandledRejection')`** - JS-level
   runtime errors. Always on, routed through the structured logger so
   secrets are redacted before they hit stdout/files.
3. **Remote reporting hook** - off by default. Plug in Sentry / Bugsnag /
   etc. by editing the `reportToRemote()` stub.

## Local-only crash dumps

No configuration needed. Native crash `.dmp` files land in
`app.getPath('crashDumps')`:

- macOS: `~/Library/Application Support/<AppName>/Crashpad/completed`
- Windows: `%APPDATA%/<AppName>/Crashpad/reports`
- Linux: `~/.config/<AppName>/Crashpad/pending`

Open the directory when reproducing a crash locally, grab the dump, and
symbolicate it with `minidump_stackwalk`.

## Remote crash uploads (electron-native)

To upload crash dumps to a Crashpad / Breakpad collector, set the submit
URL via env var:

```bash
CRASH_REPORTER_SUBMIT_URL="https://your-collector.example/submit"
CRASH_REPORTER_COMPANY="Your Company"
```

`installCrashReporter()` reads both at startup. No code changes required.

## Integrating Sentry

For a richer experience (breadcrumbs, user context, source maps), wire up
`@sentry/electron`. Four steps:

### 1. Install

```bash
bun add @sentry/electron
```

### 2. Initialize early in `main/index.ts`

```ts
import * as Sentry from "@sentry/electron/main";

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: config.devEnv,
    release: app.getVersion(),
});
```

Do this **before** `initLogger()` so Sentry captures boot-time errors too.

### 3. Replace the remote hook in `crash-reporter.ts`

```ts
import * as Sentry from "@sentry/electron/main";

function reportToRemote(kind: string, err: Error): void {
    Sentry.captureException(err, { tags: { kind } });
}
```

### 4. (Optional) Initialize Sentry in the renderer too

```ts
// src/renderer/src/main.tsx
import * as Sentry from "@sentry/electron/renderer";
Sentry.init({});
```

The renderer SDK inherits DSN / environment from the main process via IPC.

## Verifying the pipeline

Throw a test error from a menu item or a debug IPC call:

```ts
ipcMain.handle("debug:crash", () => {
    throw new Error("deliberate test crash");
});
```

Call it from the renderer once, check:

1. The structured logger printed `[CRIT] [crash] uncaughtException` with a
   redacted stack.
2. Sentry (or your collector) received the event.

## What NOT to report

- **Config objects**. They contain API keys. The redactor strips known
  patterns but don't rely on it - pass a sanitized copy.
- **User input**. If you're reporting an error mid-request, strip the
  payload or at minimum run it through `Redactor.redact()` first.
- **File paths containing home directories**. Sentry's default scrubber
  handles some of this but you should audit it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "failed to start native crash reporter" in logs | `crashReporter.start()` was called too late | Call `installCrashReporter()` before `app.whenReady()` - the template already does |
| Sentry receives nothing | DSN not set or wrong environment | `echo $SENTRY_DSN`, verify project in Sentry UI |
| Stack traces point to minified code | No source maps uploaded | Run `sentry-cli sourcemaps upload` as a post-build step |
| Renderer crashes not captured | Only main-process Sentry initialized | Add the renderer SDK (step 4) |
