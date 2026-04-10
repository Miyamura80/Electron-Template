import type { BrowserWindow } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import type { UpdateInfo, UpdateProgress } from "../shared/types";
import { safeHandle } from "./utils/ipc-safe-handle";
import { getLogger } from "./utils/logger";

/**
 * Auto-updater handlers.
 *
 * By default this module ships a **stub** - `check` returns `null`,
 * `downloadAndInstall` throws - so the template runs on unsigned dev builds
 * without a publish target. To enable real updates:
 *
 *   1. `bun add electron-updater`
 *   2. Set `UPDATER_ENABLED=true` at runtime (or `true` in production builds).
 *   3. Configure `publish` in `electron-builder.yml`.
 *
 * See `docs/runbooks/auto-update.md` for the full walkthrough.
 *
 * When `UPDATER_ENABLED=true`, this module dynamically imports
 * `electron-updater` and wires its events to {@link IpcChannels.UpdaterProgress}.
 * The dynamic import keeps `electron-updater` strictly optional: the template
 * still builds and runs without the package installed.
 */

/** Minimal structural type for the bit of `electron-updater` we rely on. */
interface AutoUpdaterLike {
    checkForUpdates(): Promise<{
        updateInfo: { version: string; releaseNotes?: string | null };
    } | null>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(): void;
    on(event: "download-progress", cb: (info: { percent: number }) => void): void;
    on(event: "error", cb: (err: Error) => void): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    removeAllListeners(event?: string): void;
}

let realUpdater: AutoUpdaterLike | null = null;
let initPromise: Promise<AutoUpdaterLike | null> | null = null;

async function loadRealUpdater(): Promise<AutoUpdaterLike | null> {
    if (realUpdater) return realUpdater;
    if (initPromise) return initPromise;
    const log = getLogger().child("updater");
    initPromise = (async () => {
        try {
            // Dynamic import by string so TypeScript doesn't try to resolve
            // the package at compile time. electron-updater is an optional
            // runtime dependency; the template builds without it installed.
            const moduleName = "electron-updater";
            const mod = (await import(moduleName).catch(() => null)) as {
                autoUpdater?: AutoUpdaterLike;
            } | null;
            if (!mod?.autoUpdater) {
                log.warn(
                    "UPDATER_ENABLED is set but 'electron-updater' is not installed",
                );
                return null;
            }
            realUpdater = mod.autoUpdater;
            log.info("electron-updater loaded");
            return realUpdater;
        } catch (err) {
            log.error("failed to load electron-updater", err);
            return null;
        }
    })();
    return initPromise;
}

function updaterEnabled(): boolean {
    return process.env.UPDATER_ENABLED === "true";
}

async function checkForUpdate(): Promise<UpdateInfo | null> {
    if (!updaterEnabled()) return null;
    const updater = await loadRealUpdater();
    if (!updater) return null;
    try {
        const result = await updater.checkForUpdates();
        if (!result) return null;
        const notes = result.updateInfo.releaseNotes;
        return {
            version: result.updateInfo.version,
            body: typeof notes === "string" ? notes : null,
        };
    } catch (err) {
        getLogger().child("updater").error("checkForUpdates failed", err);
        throw err;
    }
}

async function downloadAndInstall(): Promise<void> {
    if (!updaterEnabled()) {
        throw new Error(
            "Updater is not enabled. Set UPDATER_ENABLED=true and install 'electron-updater'. See docs/runbooks/auto-update.md.",
        );
    }
    const updater = await loadRealUpdater();
    if (!updater) {
        throw new Error(
            "electron-updater is not installed. Run 'bun add electron-updater'.",
        );
    }
    await updater.downloadUpdate();
}

async function relaunch(): Promise<void> {
    if (!updaterEnabled()) return;
    const updater = await loadRealUpdater();
    updater?.quitAndInstall();
}

export function registerUpdaterHandlers(win: BrowserWindow): void {
    const log = getLogger().child("updater");

    safeHandle(IpcChannels.UpdaterCheck, () => checkForUpdate());
    safeHandle(IpcChannels.UpdaterDownloadAndInstall, () => downloadAndInstall());
    safeHandle(IpcChannels.UpdaterRelaunch, () => relaunch());

    // If the real updater is active, stream download-progress events to the
    // renderer. We attach listeners eagerly so the preload bridge never sees
    // a missing event channel.
    if (updaterEnabled()) {
        loadRealUpdater()
            .then((updater) => {
                if (!updater) return;
                updater.on("download-progress", (info: { percent: number }) => {
                    const payload: UpdateProgress = { percent: info.percent };
                    if (!win.isDestroyed()) {
                        win.webContents.send(IpcChannels.UpdaterProgress, payload);
                    }
                });
                updater.on("error", (err: Error) => {
                    log.error("autoUpdater error", err);
                });
            })
            .catch((err) => {
                log.error("failed to attach updater listeners", err);
            });
    }
}
