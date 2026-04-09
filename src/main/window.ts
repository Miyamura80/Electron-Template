import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, shell } from "electron";
import { getConfig } from "./config";
import { buildApplicationMenu } from "./menu";
import { getLogger } from "./utils/logger";
import { attachWindowStateSaver, getInitialWindowState } from "./window-state";

const __dirname_local = fileURLToPath(new URL(".", import.meta.url));

/**
 * Create and show the main application window.
 *
 * - Uses contextIsolation + sandbox for safe IPC via preload.
 * - Restores the previous geometry via {@link getInitialWindowState}.
 * - Loads from Vite dev server in dev mode, from the packaged file otherwise.
 * - Hands off `target=_blank` / `window.open` calls to the default browser.
 */
export function createMainWindow(): BrowserWindow {
    const windowConfig = getConfig().window;
    const log = getLogger().child("window");

    const initial = getInitialWindowState({
        defaults: { width: windowConfig.width, height: windowConfig.height },
    });

    const win = new BrowserWindow({
        title: windowConfig.title,
        x: initial.x,
        y: initial.y,
        width: initial.width,
        height: initial.height,
        minWidth: windowConfig.minWidth,
        minHeight: windowConfig.minHeight,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname_local, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    attachWindowStateSaver(win, {
        defaults: { width: windowConfig.width, height: windowConfig.height },
    });

    buildApplicationMenu(win);

    win.once("ready-to-show", () => {
        if (initial.isMaximized) win.maximize();
        if (initial.isFullScreen) win.setFullScreen(true);
        win.show();
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        win.loadFile(join(__dirname_local, "../renderer/index.html"));
    }

    const position = initial.x !== undefined ? ` @ (${initial.x},${initial.y})` : "";
    log.info(`window created: ${initial.width}x${initial.height}${position}`);

    return win;
}
