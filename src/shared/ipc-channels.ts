/**
 * IPC channel names used between the main process and the renderer.
 *
 * Keep this list stable: both preload and main/renderer code refer to it
 * by constant to prevent drift across processes.
 */
export const IpcChannels = {
    /** Request the sanitized frontend config (no secrets). */
    GetAppConfig: "app:get-config",
    /** Execute an engine command by name with JSON args. */
    EngineCall: "engine:call",
    /** List every registered engine command. */
    EngineListCommands: "engine:list-commands",
    /** Ask the main process to check for a new version. */
    UpdaterCheck: "updater:check",
    /** Ask the main process to download and install the pending update. */
    UpdaterDownloadAndInstall: "updater:download-and-install",
    /** Ask the main process to relaunch after an update. */
    UpdaterRelaunch: "updater:relaunch",
    /** Event channel: main → renderer, streamed download progress. */
    UpdaterProgress: "updater:progress",
} as const;
