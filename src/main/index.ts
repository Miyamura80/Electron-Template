import { BrowserWindow, app } from "electron";
import { initConfig } from "./config";
import { registerIpcHandlers } from "./ipc";
import { registerUpdaterHandlers } from "./updater";
import { createMainWindow } from "./window";

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
