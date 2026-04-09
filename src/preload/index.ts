import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import type {
    CommandResult,
    ElectronAPI,
    FrontendConfig,
    UpdateInfo,
    UpdateProgress,
} from "../shared/types";

/**
 * Surface a narrow, typed API on `window.electronAPI`.
 *
 * Every method is a thin wrapper around `ipcRenderer.invoke` / `on`. Adding
 * new IPC calls? Define the channel in `shared/ipc-channels.ts` first, then
 * plumb it through here and the matching handler in `src/main/ipc.ts`.
 *
 * IPC values are validated at the preload boundary with minimal runtime type
 * guards. A malformed payload from the main process (or from a hostile
 * renderer replaying cached data) rejects loudly instead of crashing React.
 */

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function assertFrontendConfig(v: unknown): FrontendConfig {
    if (!isObject(v)) throw new Error("IPC: expected FrontendConfig object");
    if (typeof v.modelName !== "string") throw new Error("IPC: modelName missing");
    if (typeof v.devEnv !== "string") throw new Error("IPC: devEnv missing");
    if (!isObject(v.defaultLlm)) throw new Error("IPC: defaultLlm missing");
    if (!isObject(v.llmConfig)) throw new Error("IPC: llmConfig missing");
    if (!isObject(v.features)) throw new Error("IPC: features missing");
    return v as unknown as FrontendConfig;
}

function assertCommandResult(v: unknown): CommandResult {
    if (!isObject(v)) throw new Error("IPC: expected CommandResult object");
    if (typeof v.runId !== "string") throw new Error("IPC: runId missing");
    if (typeof v.command !== "string") throw new Error("IPC: command missing");
    if (typeof v.status !== "string") throw new Error("IPC: status missing");
    return v as unknown as CommandResult;
}

function assertStringArray(v: unknown): string[] {
    if (!Array.isArray(v)) throw new Error("IPC: expected string[]");
    for (const item of v) {
        if (typeof item !== "string") throw new Error("IPC: non-string in array");
    }
    return v;
}

function assertUpdateInfoOrNull(v: unknown): UpdateInfo | null {
    if (v === null || v === undefined) return null;
    if (!isObject(v)) throw new Error("IPC: expected UpdateInfo object or null");
    if (typeof v.version !== "string") throw new Error("IPC: version missing");
    if (v.body !== null && typeof v.body !== "string") {
        throw new Error("IPC: body must be string or null");
    }
    return v as unknown as UpdateInfo;
}

function assertUpdateProgress(v: unknown): UpdateProgress {
    if (!isObject(v)) throw new Error("IPC: expected UpdateProgress object");
    if (typeof v.percent !== "number") throw new Error("IPC: percent missing");
    return v as unknown as UpdateProgress;
}

const api: ElectronAPI = {
    getAppConfig: async () => {
        const raw = await ipcRenderer.invoke(IpcChannels.GetAppConfig);
        return assertFrontendConfig(raw);
    },

    engineCall: async (command: string, args?: unknown) => {
        const raw = await ipcRenderer.invoke(IpcChannels.EngineCall, command, args);
        return assertCommandResult(raw);
    },

    engineListCommands: async () => {
        const raw = await ipcRenderer.invoke(IpcChannels.EngineListCommands);
        return assertStringArray(raw);
    },

    updater: {
        check: async () => {
            const raw = await ipcRenderer.invoke(IpcChannels.UpdaterCheck);
            return assertUpdateInfoOrNull(raw);
        },
        downloadAndInstall: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterDownloadAndInstall) as Promise<void>,
        relaunch: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterRelaunch) as Promise<void>,
        onProgress: (cb: (progress: UpdateProgress) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
                try {
                    cb(assertUpdateProgress(progress));
                } catch (err) {
                    // Never let a bad payload crash the renderer - drop and log.
                    console.error("[preload] invalid UpdateProgress payload", err);
                }
            };
            ipcRenderer.on(IpcChannels.UpdaterProgress, listener);
            return () => {
                ipcRenderer.removeListener(IpcChannels.UpdaterProgress, listener);
            };
        },
    },
};

contextBridge.exposeInMainWorld("electronAPI", api);
