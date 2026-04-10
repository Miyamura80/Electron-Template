/**
 * Types shared between the main process and the renderer.
 *
 * This module must stay free of Node-only or Electron-only imports so that
 * the renderer can pull it in without pulling in any native code.
 */

/**
 * Sanitized config shape exposed to the renderer via IPC.
 *
 * Derived from `FrontendConfigSchema` in `./schemas.ts` so the runtime
 * validation and the static type can never drift apart.
 */
import type { FrontendConfig } from "./schemas";
export type { FrontendConfig } from "./schemas";

/** Stable status codes emitted by every engine command. */
export type CommandStatus = "pass" | "fail" | "skip" | "error";

/** Well-known error codes for engine command failures. */
export type CommandErrorCode =
    | "invalid_input"
    | "unsupported"
    | "unimplemented"
    | "dependency_missing"
    | "permission_denied"
    | "io_error"
    | "timeout"
    | "internal_error";

export interface CommandErrorInfo {
    code: CommandErrorCode;
    message: string;
}

export interface CommandEnvSummary {
    os: string;
    arch: string;
    headless: boolean;
}

export interface CommandTiming {
    startedAtMs: number;
    durationMs: number;
}

/** The stable JSON shape returned by every engine command. */
export interface CommandResult {
    runId: string;
    command: string;
    status: CommandStatus;
    error: CommandErrorInfo | null;
    timing: CommandTiming;
    envSummary: CommandEnvSummary;
    data: unknown;
}

/** Progress update streamed while the updater is downloading. */
export interface UpdateProgress {
    /** 0..100, or -1 if the total size is unknown. */
    percent: number;
}

/** Update info surfaced to the renderer by the updater. */
export interface UpdateInfo {
    version: string;
    body: string | null;
}

/**
 * Payload the renderer hands to `window.electronAPI.logRendererError` so
 * React crashes (caught by the top-level ErrorBoundary) end up in the
 * main-process structured log instead of only in the devtools console.
 */
export interface RendererErrorPayload {
    message: string;
    stack?: string | null;
    componentStack?: string | null;
    location?: string | null;
}

/**
 * The API exposed on `window.electronAPI` by the preload script.
 *
 * Keep this interface flat -every method is an async IPC round-trip except
 * the `onUpdateProgress` subscription, which returns an unsubscribe function.
 */
export interface ElectronAPI {
    getAppConfig(): Promise<FrontendConfig>;
    engineCall(command: string, args?: unknown): Promise<CommandResult>;
    engineListCommands(): Promise<string[]>;
    /**
     * Ship a crash / unhandled exception from the renderer back to the
     * main process logger. Fire-and-forget: the promise only rejects if
     * the IPC round-trip itself fails.
     */
    logRendererError(payload: RendererErrorPayload): Promise<void>;
    updater: {
        check(): Promise<UpdateInfo | null>;
        downloadAndInstall(): Promise<void>;
        relaunch(): Promise<void>;
        onProgress(cb: (progress: UpdateProgress) => void): () => void;
    };
}
