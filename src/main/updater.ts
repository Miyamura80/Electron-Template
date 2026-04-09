import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import type { UpdateInfo } from "../shared/types";

/**
 * Auto-updater handlers.
 *
 * This module ships a no-op stub by default so the template runs without
 * needing a signed build or a publish target. To enable real updates:
 *
 *   1. `bun add electron-updater`
 *   2. Replace `checkForUpdate()` below with a call to
 *      `autoUpdater.checkForUpdates()`.
 *   3. Wire `autoUpdater`'s `download-progress` events into
 *      `win.webContents.send(IpcChannels.UpdaterProgress, ...)`.
 *   4. Configure `publish` in `electron-builder.yml`.
 *
 * See `docs/runbooks/auto-update.md` (create me!) for the full walkthrough.
 */

async function checkForUpdate(): Promise<UpdateInfo | null> {
    // Default: no update available. Swap this out for your real check.
    return null;
}

async function downloadAndInstall(): Promise<void> {
    throw new Error(
        "Updater is not configured. See src/main/updater.ts for setup instructions.",
    );
}

function relaunch(): void {
    // Real implementation: autoUpdater.quitAndInstall()
}

export function registerUpdaterHandlers(_win: BrowserWindow): void {
    ipcMain.handle(IpcChannels.UpdaterCheck, () => checkForUpdate());
    ipcMain.handle(IpcChannels.UpdaterDownloadAndInstall, () => downloadAndInstall());
    ipcMain.handle(IpcChannels.UpdaterRelaunch, () => relaunch());
}
