import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { getLogger } from "./logger";

type Handler<R> = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<R> | R;

/**
 * Wrap an IPC handler so uncaught exceptions are logged with structured
 * context before being re-thrown back to the renderer.
 *
 * Without this every handler has to remember to try/catch or the error is
 * silently rejected with no breadcrumb in the main process log. This helper
 * lives in `utils/` so both `ipc.ts` and `updater.ts` (and any future module
 * that registers IPC handlers) share the exact same logging behaviour.
 */
export function safeHandle<R>(channel: string, handler: Handler<R>): void {
    const log = getLogger().child(`ipc:${channel}`);
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
        try {
            return await handler(event, ...args);
        } catch (err) {
            log.error("handler threw", err);
            // Re-throw so the renderer's .catch() still fires, but the main
            // process log now has the full stack.
            throw err instanceof Error ? err : new Error(String(err));
        }
    });
}
