import { ipcMain } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import { getConfig, toFrontendConfig } from "./config";
import { createEngine } from "./engine";

const engine = createEngine();

/**
 * Register every request/response IPC handler used by the renderer.
 *
 * Event-style channels (like `UpdaterProgress`) are emitted directly from
 * their owning module via `webContents.send`, not through this registrar.
 */
export function registerIpcHandlers(): void {
    ipcMain.handle(IpcChannels.GetAppConfig, () => toFrontendConfig(getConfig()));

    ipcMain.handle(
        IpcChannels.EngineCall,
        async (_event, command: string, args?: unknown) => {
            return engine.execute(command, args ?? {});
        },
    );

    ipcMain.handle(IpcChannels.EngineListCommands, () => engine.listCommands());
}
