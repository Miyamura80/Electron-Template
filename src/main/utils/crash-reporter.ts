import { app, crashReporter } from "electron";
import { getLogger } from "./logger";

/**
 * Install process-level crash / error plumbing.
 *
 * Three layers:
 *   1. Electron's native `crashReporter` - captures hard C++ crashes in the
 *      main process and child processes. Dumps are written locally; no remote
 *      upload unless `submitURL` is configured via env var.
 *   2. `process.on('uncaughtException' | 'unhandledRejection')` - captures
 *      JS-level runtime errors and routes them through the structured logger
 *      so secrets stay redacted and nothing lands on raw stdout.
 *   3. Optional remote report hook - if `SENTRY_DSN` (or similar) is set, a
 *      project can plug in `@sentry/electron` here without touching the
 *      rest of the template. See `docs/runbooks/crash-reporter.md`.
 *
 * Call this exactly once, early in main process startup (before window
 * creation, after the logger is initialized).
 */
export function installCrashReporter(): void {
    const log = getLogger().child("crash");

    const submitURL = process.env.CRASH_REPORTER_SUBMIT_URL;
    try {
        crashReporter.start({
            productName: app.getName(),
            companyName: process.env.CRASH_REPORTER_COMPANY ?? "",
            submitURL: submitURL ?? "",
            uploadToServer: Boolean(submitURL),
            ignoreSystemCrashHandler: false,
            compress: true,
        });
        log.info(
            `native crash reporter started (remote upload: ${Boolean(submitURL)})`,
        );
    } catch (err) {
        log.warn("failed to start native crash reporter", err);
    }

    process.on("uncaughtException", (err) => {
        log.critical("uncaughtException", err);
        reportToRemote("uncaughtException", err);
        // Registering an uncaughtException listener suppresses Node's default
        // "print stack + exit" behavior. Without an explicit exit the main
        // process would stay alive in an undefined state, which is strictly
        // more dangerous than crashing cleanly. Exit code 1 matches Node's
        // default for an uncaught exception.
        process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        log.critical("unhandledRejection", err);
        reportToRemote("unhandledRejection", err);
    });
}

/**
 * Hook for a remote error-reporting service (Sentry, Bugsnag, etc.).
 *
 * This is intentionally a stub: picking a vendor is a per-project decision,
 * and we don't want to ship the SDK unless the app actually uses it. To
 * enable Sentry, add `@sentry/electron` and replace the body of this
 * function with `Sentry.captureException(err)` - see
 * `docs/runbooks/crash-reporter.md` for the full walkthrough.
 */
function reportToRemote(_kind: string, _err: Error): void {
    // Intentionally empty. See JSDoc above.
}
