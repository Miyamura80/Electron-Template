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
        const raw = await invokeWithTimeout(
            IpcChannels.GetAppConfig,
            DEFAULT_IPC_TIMEOUT_MS,
        );
        return assertFrontendConfig(raw);
    },

    engineCall: async (command: string, args?: unknown) => {
        const raw = await invokeWithTimeout(
            IpcChannels.EngineCall,
            DEFAULT_IPC_TIMEOUT_MS,
            command,
            args,
        );
        return assertCommandResult(raw);
    },

    engineListCommands: async () => {
        const raw = await invokeWithTimeout(
            IpcChannels.EngineListCommands,
            DEFAULT_IPC_TIMEOUT_MS,
        );
        return assertStringArray(raw);
    },

    updater: {
        check: async () => {
            const raw = await invokeWithTimeout(
                IpcChannels.UpdaterCheck,
                DEFAULT_IPC_TIMEOUT_MS,
            );
            return assertUpdateInfoOrNull(raw);
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
