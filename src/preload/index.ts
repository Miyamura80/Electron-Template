import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
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
 *
 * Every `invoke` call is wrapped in {@link invokeWithTimeout} so a wedged
 * or crashed main process surfaces as a rejected promise instead of leaving
 * the renderer hanging forever.
 */

/** Default budget for "interactive" IPC calls (config fetch, command runs). */
const DEFAULT_IPC_TIMEOUT_MS = 30_000;
/**
 * Long-running operations that legitimately take minutes (downloading an
 * update, etc.) get a much larger budget. Still bounded so a truly stuck
 * call eventually fails instead of hanging forever.
 */
const LONG_IPC_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * `ipcRenderer.invoke` will hang indefinitely if the main process never
 * responds (handler missing, main crashed, deadlock). Race it against a
 * timeout so callers always get a deterministic outcome - either the real
 * value or a thrown `IpcTimeoutError` they can show in the UI.
 */
function invokeWithTimeout<T>(
    channel: string,
    timeoutMs: number,
    ...args: unknown[]
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`IPC call '${channel}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        ipcRenderer.invoke(channel, ...args).then(
            (value) => {
                clearTimeout(timer);
                resolve(value as T);
            },
            (err: unknown) => {
                clearTimeout(timer);
                reject(err instanceof Error ? err : new Error(String(err)));
            },
        );
    });
}

const api: ElectronAPI = {
    getAppConfig: async () => {
        const raw = await invokeWithTimeout(
            IpcChannels.GetAppConfig,
            DEFAULT_IPC_TIMEOUT_MS,
        );
        return FrontendConfigSchema.parse(raw);
    },

    engineCall: async (command: string, args?: unknown) => {
        const raw = await invokeWithTimeout(
            IpcChannels.EngineCall,
            DEFAULT_IPC_TIMEOUT_MS,
            command,
            args,
        );
        return CommandResultSchema.parse(raw);
    },

    engineListCommands: async () => {
        const raw = await invokeWithTimeout(
            IpcChannels.EngineListCommands,
            DEFAULT_IPC_TIMEOUT_MS,
        );
        return z.array(z.string()).parse(raw);
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
            const raw = await invokeWithTimeout(
                IpcChannels.UpdaterCheck,
                DEFAULT_IPC_TIMEOUT_MS,
            );
            return UpdateInfoOrNullSchema.parse(raw);
        },
        // Downloads can legitimately take many minutes on slow connections;
        // give them the long budget so the timeout only fires on a truly
        // wedged main process, not on healthy slow downloads.
        downloadAndInstall: () =>
            invokeWithTimeout<void>(
                IpcChannels.UpdaterDownloadAndInstall,
                LONG_IPC_TIMEOUT_MS,
            ),
        relaunch: () =>
            invokeWithTimeout<void>(
                IpcChannels.UpdaterRelaunch,
                DEFAULT_IPC_TIMEOUT_MS,
            ),
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
