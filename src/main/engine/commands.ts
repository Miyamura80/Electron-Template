import { arch, platform } from "node:os";
import {
    type CommandContext,
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
 * A map of `name -> definition` that executes commands with a stable result
 * shape.
 *
 * The registry is headless: it knows nothing about Electron IPC, windows, or
 * the renderer. That keeps it easy to unit-test and lets you re-use the same
 * commands from a CLI or a future worker thread.
 *
 * Runtime capabilities (like the filesystem allowlist) are supplied once at
 * construction time via {@link CommandContext} and automatically forwarded
 * to every handler - callers of `execute` never have to touch the context.
 *
 * If a {@link CommandDefinition} supplies an `argsSchema`, the registry runs
 * it on the raw args before calling the handler and returns a `fail` result
 * with code `invalid_input` on parse errors. Handlers therefore only need
 * to worry about the happy path.
 */
export class CommandRegistry {
    private defs: Map<string, CommandDefinition> = new Map();

    constructor(private readonly context: CommandContext) {}

    register(name: string, handler: CommandHandler): void;
    register<T>(def: CommandDefinition<T>): void;
    register<T>(a: string | CommandDefinition<T>, b?: CommandHandler): void {
        const def: CommandDefinition =
            typeof a === "string"
                ? { name: a, handler: b as CommandHandler }
                : (a as CommandDefinition);
        if (this.defs.has(def.name)) {
            throw new Error(`Command already registered: ${def.name}`);
        }
        this.defs.set(def.name, def);
    }

    registerAll(defs: CommandDefinition[]): void {
        for (const def of defs) this.register(def);
    }

    listCommands(): string[] {
        return Array.from(this.defs.keys()).sort();
    }

    has(name: string): boolean {
        return this.defs.has(name);
    }

    async execute(name: string, args: unknown = {}): Promise<CommandResult> {
        const runId = randomRunId();
        const startedAtMs = Date.now();
        const envSummary = makeEnvSummary();
        const def = this.defs.get(name);

        if (!def) {
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

        let parsedArgs: unknown = args;
        if (def.argsSchema) {
            const result = def.argsSchema.safeParse(args);
            if (!result.success) {
                const message = result.error.issues
                    .map(
                        (issue) =>
                            `${issue.path.join(".") || "(root)"}: ${issue.message}`,
                    )
                    .join("; ");
                return {
                    runId,
                    command: name,
                    status: "fail",
                    error: { code: "invalid_input", message },
                    timing: {
                        startedAtMs,
                        durationMs: Date.now() - startedAtMs,
                    },
                    envSummary,
                    data: null,
                };
            }
            parsedArgs = result.data;
        }

        try {
            const data = await def.handler(parsedArgs, this.context);
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
