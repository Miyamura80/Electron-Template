import { BrowserWindow, app, session } from "electron";
import { initConfig } from "./config";
import { registerIpcHandlers } from "./ipc";
import { registerUpdaterHandlers } from "./updater";
import { createMainWindow } from "./window";

/**
 * Install a Content-Security-Policy header on the default session.
 *
 * We cannot use a <meta http-equiv="Content-Security-Policy"> in the HTML
 * because Vite's dev server injects an inline React-Refresh script and opens
 * a WebSocket for HMR, neither of which is allowed by a strict `'self'` CSP.
 * Setting the header here lets us relax the policy in development while
 * keeping a strict policy for packaged builds.
 */
function installCspHeaders(isDev: boolean): void {
    const csp = isDev
        ? [
              "default-src 'self' http://localhost:5173 ws://localhost:5173",
              "script-src 'self' 'unsafe-inline' http://localhost:5173",
              "style-src 'self' 'unsafe-inline' http://localhost:5173",
              "img-src 'self' data: http://localhost:5173",
              "connect-src 'self' http://localhost:5173 ws://localhost:5173",
          ].join("; ")
        : [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
          ].join("; ");

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [csp],
            },
        });
    });
}

// Load and validate config before any window is created. If this throws the
// process exits; a broken config should be loud and fatal, not silent.
const config = initConfig({ projectRoot: app.getAppPath() });
console.log(
    `[startup] model=${config.defaultLlm.defaultModel} env=${config.devEnv} running_on=${config.runningOn}`,
);

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

    app.whenReady().then(() => {
        installCspHeaders(Boolean(process.env.ELECTRON_RENDERER_URL));
        registerIpcHandlers();
        const mainWindow = createMainWindow();
        registerUpdaterHandlers(mainWindow);

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWindow();
            }
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
