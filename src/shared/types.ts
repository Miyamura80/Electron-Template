/**
 * Types shared between the main process and the renderer.
 *
 * This module must stay free of Node-only or Electron-only imports so that
 * the renderer can pull it in without pulling in any native code.
 */

/** Sanitized config shape exposed to the renderer via IPC. */
export interface FrontendConfig {
    modelName: string;
    devEnv: string;
    exampleParent: {
        exampleChild: string;
    };
    defaultLlm: {
        defaultModel: string;
        fallbackModel: string | null;
        defaultTemperature: number;
        defaultMaxTokens: number;
    };
    llmConfig: {
        cacheEnabled: boolean;
        retry: {
            maxAttempts: number;
            minWaitSeconds: number;
            maxWaitSeconds: number;
        };
    };
    features: Record<string, boolean>;
}

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
 * The API exposed on `window.electronAPI` by the preload script.
 *
 * Keep this interface flat -every method is an async IPC round-trip except
 * the `onUpdateProgress` subscription, which returns an unsubscribe function.
 */
export interface ElectronAPI {
    getAppConfig(): Promise<FrontendConfig>;
    engineCall(command: string, args?: unknown): Promise<CommandResult>;
    engineListCommands(): Promise<string[]>;
    updater: {
        check(): Promise<UpdateInfo | null>;
        downloadAndInstall(): Promise<void>;
        relaunch(): Promise<void>;
        onProgress(cb: (progress: UpdateProgress) => void): () => void;
    };
}
