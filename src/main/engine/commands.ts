import { arch, platform } from "node:os";
import {
    type CommandDefinition,
    CommandError,
    type CommandHandler,
    type CommandResult,
} from "./types";

function makeEnvSummary() {
    return {
        os: platform(),
        arch: arch(),
        headless: process.env.DISPLAY === undefined && platform() === "linux",
    };
}

function randomRunId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A map of `name → handler` that executes commands with a stable result shape.
 *
 * The registry is headless: it knows nothing about Electron IPC, windows, or
 * the renderer. That keeps it easy to unit-test and lets you re-use the same
 * commands from a CLI or a future worker thread.
 */
export class CommandRegistry {
    private handlers: Map<string, CommandHandler> = new Map();

    register(name: string, handler: CommandHandler): void {
        if (this.handlers.has(name)) {
            throw new Error(`Command already registered: ${name}`);
        }
        this.handlers.set(name, handler);
    }

    registerAll(defs: CommandDefinition[]): void {
        for (const def of defs) this.register(def.name, def.handler);
    }

    listCommands(): string[] {
        return Array.from(this.handlers.keys()).sort();
    }

    has(name: string): boolean {
        return this.handlers.has(name);
    }

    async execute(name: string, args: unknown = {}): Promise<CommandResult> {
        const runId = randomRunId();
        const startedAtMs = Date.now();
        const envSummary = makeEnvSummary();
        const handler = this.handlers.get(name);

        if (!handler) {
            return {
                runId,
                command: name,
                status: "error",
                error: {
                    code: "unsupported",
                    message: `Unknown command: ${name}`,
                },
                timing: { startedAtMs, durationMs: 0 },
                envSummary,
                data: null,
            };
        }

        try {
            const data = await handler(args);
            return {
                runId,
                command: name,
                status: "pass",
                error: null,
                timing: {
                    startedAtMs,
                    durationMs: Date.now() - startedAtMs,
                },
                envSummary,
                data,
            };
        } catch (err) {
            const isCommandError = err instanceof CommandError;
            return {
                runId,
                command: name,
                status: isCommandError ? "fail" : "error",
                error: {
                    code: isCommandError ? err.code : "internal_error",
                    message: err instanceof Error ? err.message : String(err),
                },
                timing: {
                    startedAtMs,
                    durationMs: Date.now() - startedAtMs,
                },
                envSummary,
                data: null,
            };
        }
    }
}
