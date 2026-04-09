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
 */
const api: ElectronAPI = {
    getAppConfig: () =>
        ipcRenderer.invoke(IpcChannels.GetAppConfig) as Promise<FrontendConfig>,

    engineCall: (command: string, args?: unknown) =>
        ipcRenderer.invoke(
            IpcChannels.EngineCall,
            command,
            args,
        ) as Promise<CommandResult>,

    engineListCommands: () =>
        ipcRenderer.invoke(IpcChannels.EngineListCommands) as Promise<string[]>,

    updater: {
        check: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterCheck) as Promise<UpdateInfo | null>,
        downloadAndInstall: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterDownloadAndInstall) as Promise<void>,
        relaunch: () =>
            ipcRenderer.invoke(IpcChannels.UpdaterRelaunch) as Promise<void>,
        onProgress: (cb: (progress: UpdateProgress) => void) => {
            const listener = (
                _event: Electron.IpcRendererEvent,
                progress: UpdateProgress,
            ) => cb(progress);
            ipcRenderer.on(IpcChannels.UpdaterProgress, listener);
            return () => {
                ipcRenderer.removeListener(IpcChannels.UpdaterProgress, listener);
            };
        },
    },
};

contextBridge.exposeInMainWorld("electronAPI", api);
