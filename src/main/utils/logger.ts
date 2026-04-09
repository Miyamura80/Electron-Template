import { randomBytes, randomUUID } from "node:crypto";
import type { LoggingConfig } from "../config/schemas";
import { Redactor } from "./redact";

/**
 * Structured logger driven by {@link LoggingConfig}.
 *
 * Respects level toggles, optional time/session-id prefixes, and pipes every
 * emitted string through the {@link Redactor} before it hits the underlying
 * console sink. Use {@link initLogger} once at startup, then {@link getLogger}
 * from anywhere in the main process.
 *
 * Renderer code must NOT import this module - logs cross the IPC boundary
 * via a dedicated channel instead, so secret-bearing config never leaks.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

interface Logger {
    debug(message: string, ...extra: unknown[]): void;
    info(message: string, ...extra: unknown[]): void;
    warn(message: string, ...extra: unknown[]): void;
    error(message: string, ...extra: unknown[]): void;
    critical(message: string, ...extra: unknown[]): void;
    child(scope: string): Logger;
}

interface LoggerOptions {
    config: LoggingConfig;
    sessionId?: string;
    /** Override the underlying sink (useful for tests). */
    sink?: (level: LogLevel, line: string) => void;
}

const LEVEL_TAGS: Record<LogLevel, string> = {
    debug: "DEBUG",
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
    critical: "CRIT",
};

function defaultSink(level: LogLevel, line: string): void {
    // The logger is the one place where console usage is legitimate.
    // Everything else should funnel through getLogger().
    if (level === "error" || level === "critical") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug") console.debug(line);
    else console.log(line);
}

function randomSessionId(): string {
    // Use Node's crypto module (always available in the main process). We
    // prefer randomUUID when present and fall back to randomBytes - both are
    // CSPRNG-backed, so CodeQL's "insecure randomness" rule is satisfied
    // even though session IDs are log-correlation tokens, not auth secrets.
    try {
        return randomUUID().slice(0, 8);
    } catch {
        return randomBytes(4).toString("hex");
    }
}

function levelEnabled(config: LoggingConfig, level: LogLevel): boolean {
    switch (level) {
        case "debug":
            return config.levels.debug;
        case "info":
            return config.levels.info;
        case "warn":
            return config.levels.warning;
        case "error":
            return config.levels.error;
        case "critical":
            return config.levels.critical;
    }
}

class LoggerImpl implements Logger {
    private readonly scope: string | null;

    constructor(
        private readonly config: LoggingConfig,
        private readonly sessionId: string,
        private readonly redactor: Redactor,
        private readonly sink: (level: LogLevel, line: string) => void,
        scope: string | null = null,
    ) {
        this.scope = scope;
    }

    debug(message: string, ...extra: unknown[]): void {
        this.emit("debug", message, extra);
    }
    info(message: string, ...extra: unknown[]): void {
        this.emit("info", message, extra);
    }
    warn(message: string, ...extra: unknown[]): void {
        this.emit("warn", message, extra);
    }
    error(message: string, ...extra: unknown[]): void {
        this.emit("error", message, extra);
    }
    critical(message: string, ...extra: unknown[]): void {
        this.emit("critical", message, extra);
    }

    child(scope: string): Logger {
        const combined = this.scope ? `${this.scope}.${scope}` : scope;
        return new LoggerImpl(
            this.config,
            this.sessionId,
            this.redactor,
            this.sink,
            combined,
        );
    }

    private emit(level: LogLevel, message: string, extra: unknown[]): void {
        if (!levelEnabled(this.config, level)) return;

        const parts: string[] = [];
        if (this.config.format.showTime) {
            parts.push(new Date().toISOString());
        }
        if (this.config.format.showSessionId) {
            parts.push(`[${this.sessionId}]`);
        }
        parts.push(`[${LEVEL_TAGS[level]}]`);
        if (this.scope) parts.push(`[${this.scope}]`);
        parts.push(message);

        if (extra.length > 0) {
            parts.push(extra.map((x) => safeStringify(x)).join(" "));
        }

        const line = this.redactor.redact(parts.join(" "));
        this.sink(level, line);
    }
}

function safeStringify(value: unknown): string {
    if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`;
    }
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

let activeLogger: Logger | null = null;

/**
 * Initialize the process-wide logger. Call this once at startup after the
 * config is loaded.
 */
export function initLogger(options: LoggerOptions): Logger {
    const sessionId = options.sessionId ?? randomSessionId();
    const redactor = new Redactor(
        options.config.redaction.patterns,
        options.config.redaction.enabled,
    );
    activeLogger = new LoggerImpl(
        options.config,
        sessionId,
        redactor,
        options.sink ?? defaultSink,
    );
    return activeLogger;
}

/**
 * Retrieve the initialized logger. Falls back to a minimal console-backed
 * logger if {@link initLogger} has not been called yet - that way early
 * startup code (e.g. config loading itself) can still emit diagnostics.
 */
export function getLogger(): Logger {
    if (activeLogger) return activeLogger;
    return fallbackLogger;
}

const fallbackConfig: LoggingConfig = {
    verbose: false,
    format: {
        showTime: false,
        showSessionId: false,
        location: {
            enabled: false,
            showFile: false,
            showFunction: false,
            showLine: false,
            showForInfo: false,
            showForDebug: false,
            showForWarning: false,
            showForError: false,
        },
    },
    levels: {
        debug: false,
        info: true,
        warning: true,
        error: true,
        critical: true,
    },
    redaction: {
        enabled: true,
        useDefaultPii: true,
        patterns: [],
    },
};

const fallbackLogger: Logger = new LoggerImpl(
    fallbackConfig,
    "boot",
    new Redactor([], true),
    defaultSink,
);
