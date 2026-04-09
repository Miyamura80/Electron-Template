import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, shell } from "electron";
import { getConfig } from "./config";

const __dirname_local = fileURLToPath(new URL(".", import.meta.url));

/**
 * Create and show the main application window.
 *
 * - Uses contextIsolation + sandbox for safe IPC via preload.
 * - Loads from Vite dev server in dev mode, from the packaged file otherwise.
 * - Hands off `target=_blank` / `window.open` calls to the default browser.
 */
export function createMainWindow(): BrowserWindow {
    const windowConfig = getConfig().window;

    const win = new BrowserWindow({
        title: windowConfig.title,
        width: windowConfig.width,
        height: windowConfig.height,
        minWidth: windowConfig.minWidth,
        minHeight: windowConfig.minHeight,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname_local, "../preload/index.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    win.once("ready-to-show", () => {
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

    return win;
}
