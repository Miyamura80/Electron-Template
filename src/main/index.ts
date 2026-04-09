import { BrowserWindow, app, session } from "electron";
import { initConfig } from "./config";
import { registerIpcHandlers } from "./ipc";
import { registerUpdaterHandlers } from "./updater";
import { installCrashReporter } from "./utils/crash-reporter";
import { getLogger, initLogger } from "./utils/logger";
import { createMainWindow } from "./window";

/**
 * Install a Content-Security-Policy header on the default session.
 *
 * We cannot use a <meta http-equiv="Content-Security-Policy"> in the HTML
 * because Vite's dev server injects an inline React-Refresh script and opens
 * a WebSocket for HMR, neither of which is allowed by a strict `'self'` CSP.
 * Setting the header here lets us relax the policy in development while
 * keeping a strict policy for packaged builds.
 *
 * In dev, the allowed origin is derived from ELECTRON_RENDERER_URL so the
 * policy tracks whatever port Vite actually picked (it auto-increments when
 * the default 5173 is taken). The WebSocket origin is the same host with
 * http:// swapped for ws://.
 */
function installCspHeaders(): void {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    let csp: string;
    if (rendererUrl) {
        const origin = new URL(rendererUrl).origin;
        const wsOrigin = origin.replace(/^http/, "ws");
        csp = [
            `default-src 'self' ${origin} ${wsOrigin}`,
            `script-src 'self' 'unsafe-inline' ${origin}`,
            `style-src 'self' 'unsafe-inline' ${origin}`,
            `img-src 'self' data: ${origin}`,
            `connect-src 'self' ${origin} ${wsOrigin}`,
        ].join("; ");
    } else {
        csp = [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
        ].join("; ");
    }

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        // Drop any upstream CSP header (case-insensitively) before adding our
        // own, otherwise spreading `responseHeaders` can leave a lowercase
        // `content-security-policy` key alongside our PascalCase key and the
        // browser applies the intersection of both policies.
        const filtered = Object.fromEntries(
            Object.entries(details.responseHeaders ?? {}).filter(
                ([key]) => key.toLowerCase() !== "content-security-policy",
            ),
        );
        callback({
            responseHeaders: {
                ...filtered,
                "Content-Security-Policy": [csp],
            },
        });
    });
}

// Load and validate config before any window is created. If this throws the
// process exits; a broken config should be loud and fatal, not silent.
const config = initConfig({ projectRoot: app.getAppPath() });

// Bring up the structured logger the moment config is available. Everything
// after this point must funnel through the logger rather than touching
// console.* directly - see src/main/utils/logger.ts.
const log = initLogger({ config: config.logging });
log.info(
    `startup model=${config.defaultLlm.defaultModel} env=${config.devEnv} running_on=${config.runningOn}`,
);

// Install crash plumbing BEFORE any risky code runs. Covers uncaught JS
// exceptions, unhandled rejections, and native crashes.
installCrashReporter();

// Single-instance guard: refuse to spawn a second instance and focus the
// existing window instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        const [first] = BrowserWindow.getAllWindows();
        if (first) {
            if (first.isMinimized()) first.restore();
            first.focus();
        }
    });

    app.whenReady()
        .then(() => {
            installCspHeaders();
            registerIpcHandlers();
            const mainWindow = createMainWindow();
            registerUpdaterHandlers(mainWindow);

            app.on("activate", () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    createMainWindow();
                }
            });
        })
        .catch((err) => {
            getLogger().critical("app.whenReady handler failed", err);
        });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
