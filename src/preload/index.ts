import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import {
    CommandResultSchema,
    FrontendConfigSchema,
    UpdateInfoOrNullSchema,
    UpdateProgressSchema,
} from "../shared/schemas";
import type {
    ElectronAPI,
    RendererErrorPayload,
    UpdateProgress,
} from "../shared/types";

/**
 * Surface a narrow, typed API on `window.electronAPI`.
 *
 * Every method is a thin wrapper around `ipcRenderer.invoke` / `on`. Adding
 * new IPC calls? Define the channel in `shared/ipc-channels.ts` first, then
 * plumb it through here and the matching handler in `src/main/ipc.ts`.
 *
 * Outbound responses are validated against shared zod schemas at the
 * preload boundary. A malformed payload from the main process (or from a
 * hostile renderer replaying cached data) is rejected with a descriptive
 * error path instead of silently corrupting React state.
 */

const api: ElectronAPI = {
    getAppConfig: async () => {
        const raw = await ipcRenderer.invoke(IpcChannels.GetAppConfig);
        return FrontendConfigSchema.parse(raw);
    },

    engineCall: async (command: string, args?: unknown) => {
        const raw = await ipcRenderer.invoke(IpcChannels.EngineCall, command, args);
        return CommandResultSchema.parse(raw);
    },

    engineListCommands: async () => {
        const raw = await ipcRenderer.invoke(IpcChannels.EngineListCommands);
        if (!Array.isArray(raw)) {
            throw new Error("IPC: expected string[] from engineListCommands");
        }
        for (const item of raw) {
            if (typeof item !== "string") {
                throw new Error("IPC: non-string entry in engineListCommands result");
            }
        }
        return raw as string[];
    },

    logRendererError: async (payload: RendererErrorPayload) => {
        // Best-effort: never let a logging failure crash the renderer.
        try {
            await ipcRenderer.invoke(IpcChannels.LogRendererError, payload);
        } catch (err) {
            console.error("[preload] failed to forward renderer error", err);
        }
    },

    updater: {
        check: async () => {
            const raw = await ipcRenderer.invoke(IpcChannels.UpdaterCheck);
            return UpdateInfoOrNullSchema.parse(raw);
        },
        downloadAndInstall: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterDownloadAndInstall) as Promise<void>,
        relaunch: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterRelaunch) as Promise<void>,
        onProgress: (cb: (progress: UpdateProgress) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
                const parsed = UpdateProgressSchema.safeParse(progress);
                if (!parsed.success) {
                    // Never let a bad payload crash the renderer - drop and log.
                    console.error(
                        "[preload] invalid UpdateProgress payload",
                        parsed.error.issues,
                    );
                    return;
                }
                cb(parsed.data);
            };
            ipcRenderer.on(IpcChannels.UpdaterProgress, listener);
            return () => {
                ipcRenderer.removeListener(IpcChannels.UpdaterProgress, listener);
            };
        },
    },
};

contextBridge.exposeInMainWorld("electronAPI", api);
