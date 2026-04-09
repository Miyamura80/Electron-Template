import { app, ipcMain } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import { getConfig, toFrontendConfig } from "./config";
import { type CommandRegistry, createEngine } from "./engine";

let engine: CommandRegistry | null = null;

/**
 * Default filesystem allowlist for `read_file` / `write_file`.
 *
 * Kept intentionally narrow: the per-user data directory (safe for config,
 * caches, scratch files) plus the packaged app path (read-only at runtime
 * in production). Widen this only if you know exactly what you are doing -
 * anything reachable through `window.electronAPI.engineCall` is reachable
 * by any XSS vector that lands inside the renderer.
 *
 * Must only be called after `app.whenReady()` resolves because
 * `app.getPath("userData")` is not valid before then.
 */
function defaultAllowedPaths(): string[] {
    return [app.getPath("userData"), app.getAppPath()];
}

/**
 * Register every request/response IPC handler used by the renderer.
 *
 * Event-style channels (like `UpdaterProgress`) are emitted directly from
 * their owning module via `webContents.send`, not through this registrar.
 *
 * Must be called from inside `app.whenReady()` so the engine's filesystem
 * allowlist can be resolved safely.
 */
export function registerIpcHandlers(): void {
    engine = createEngine({ allowedPaths: defaultAllowedPaths() });

    ipcMain.handle(IpcChannels.GetAppConfig, () => toFrontendConfig(getConfig()));

    ipcMain.handle(
        IpcChannels.EngineCall,
        async (_event, command: string, args?: unknown) => {
            if (!engine) {
                throw new Error(
                    "Engine not initialized. Call registerIpcHandlers() first.",
                );
            }
            return engine.execute(command, args ?? {});
        },
    );

    ipcMain.handle(IpcChannels.EngineListCommands, () => {
        if (!engine) {
            throw new Error(
                "Engine not initialized. Call registerIpcHandlers() first.",
            );
        }
        return engine.listCommands();
    });
}
