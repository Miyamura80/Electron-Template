import { app } from "electron";
import { IpcChannels } from "../shared/ipc-channels";
import {
    AnalyticsCaptureSchema,
    EngineCallArgsSchema,
    RendererErrorReportSchema,
} from "../shared/schemas";
import { captureEvent } from "./analytics";
import { getConfig, toFrontendConfig } from "./config";
import { type CommandRegistry, createEngine } from "./engine";
import { safeHandle } from "./utils/ipc-safe-handle";
import { getLogger } from "./utils/logger";

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

    safeHandle(IpcChannels.GetAppConfig, () => toFrontendConfig(getConfig()));

    safeHandle(IpcChannels.EngineCall, async (_event, ...args: unknown[]) => {
        if (!engine) {
            throw new Error(
                "Engine not initialized. Call registerIpcHandlers() first.",
            );
        }
        // Validate the [command, args?] tuple at the IPC boundary so the
        // engine itself never sees a non-string command. Per-command arg
        // shape is enforced inside the registry via each command's
        // `argsSchema` (see src/main/engine/built-ins/*.ts).
        const parsed = EngineCallArgsSchema.safeParse(args);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            const where = issue?.path?.join(".") || "args";
            throw new Error(
                `engineCall: invalid arguments at ${where}: ${issue?.message ?? "unknown"}`,
            );
        }
        const [command, commandArgs] = parsed.data;
        return engine.execute(command, commandArgs ?? {});
    });

    safeHandle(IpcChannels.EngineListCommands, () => {
        if (!engine) {
            throw new Error(
                "Engine not initialized. Call registerIpcHandlers() first.",
            );
        }
        return engine.listCommands();
    });

    // Renderer crash reports. Validate aggressively - this channel is
    // best-effort, never `throw` past the validator (we don't want a bad
    // payload to crash the very logger we'd use to record it).
    safeHandle(IpcChannels.LogRendererError, (_event, ...args: unknown[]) => {
        const parsed = RendererErrorReportSchema.safeParse(args[0]);
        if (!parsed.success) {
            getLogger()
                .child("renderer")
                .warn("rejected malformed renderer-error payload", parsed.error.issues);
            return;
        }
        const report = parsed.data;
        const log = getLogger().child("renderer");
        const tail = [report.componentStack, report.location, report.stack]
            .filter((s): s is string => Boolean(s))
            .join("\n");
        log.error(`renderer crash: ${report.message}${tail ? `\n${tail}` : ""}`);
    });

    // Analytics events from the renderer. Best-effort like LogRendererError:
    // validate aggressively but never throw past the validator.
    safeHandle(IpcChannels.AnalyticsCapture, (_event, ...args: unknown[]) => {
        const parsed = AnalyticsCaptureSchema.safeParse(args[0]);
        if (!parsed.success) {
            getLogger()
                .child("analytics")
                .warn("rejected malformed analytics payload", parsed.error.issues);
            return;
        }
        captureEvent(parsed.data.event, parsed.data.properties);
    });
}
