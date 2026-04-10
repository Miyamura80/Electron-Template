import { arch, platform } from "node:os";
import {
    type ArgsValidator,
    type CommandContext,
    type CommandDefinition,
    CommandError,
    type CommandHandler,
    type CommandResult,
} from "./types";

/**
 * Internal bookkeeping for a registered command: the raw handler plus an
 * optional schema the registry runs before dispatching.
 */
interface RegistryEntry {
    handler: CommandHandler;
    argsSchema?: ArgsValidator;
}

/**
 * Turn the first zod issue into a human-readable string without pulling
 * in zod's `formatError` helper. We only surface the first failure - the
 * renderer uses this for a toast, not an exhaustive form-validation UI.
 */
function firstIssueMessage(
    issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
    if (issues.length === 0) return "invalid input";
    const issue = issues[0];
    const path =
        issue.path.length > 0 ? issue.path.map((p) => String(p)).join(".") : "<root>";
    return `${path}: ${issue.message}`;
}

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
 *
 * Runtime capabilities (like the filesystem allowlist) are supplied once at
 * construction time via {@link CommandContext} and automatically forwarded
 * to every handler - callers of `execute` never have to touch the context.
 */
export class CommandRegistry {
    private handlers: Map<string, RegistryEntry> = new Map();

    constructor(private readonly context: CommandContext) {}

    register<Args>(
        name: string,
        handler: CommandHandler<Args>,
        argsSchema?: ArgsValidator<Args>,
    ): void {
        if (this.handlers.has(name)) {
            throw new Error(`Command already registered: ${name}`);
        }
        this.handlers.set(name, {
            handler: handler as CommandHandler,
            argsSchema: argsSchema as ArgsValidator | undefined,
        });
    }

    registerAll(defs: CommandDefinition[]): void {
        for (const def of defs) {
            this.register(def.name, def.handler, def.argsSchema);
        }
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
        const entry = this.handlers.get(name);

        if (!entry) {
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

        // Validate args at the boundary so handlers never have to worry
        // about malformed input. A failed parse becomes a `fail` result
        // with code `invalid_input` - the same shape an explicit
        // `CommandError("invalid_input", ...)` would produce.
        let parsedArgs: unknown = args;
        if (entry.argsSchema) {
            const parseResult = entry.argsSchema.safeParse(args);
            if (!parseResult.success) {
                return {
                    runId,
                    command: name,
                    status: "fail",
                    error: {
                        code: "invalid_input",
                        message: firstIssueMessage(parseResult.error.issues),
                    },
                    timing: {
                        startedAtMs,
                        durationMs: Date.now() - startedAtMs,
                    },
                    envSummary,
                    data: null,
                };
            }
            parsedArgs = parseResult.data;
        }

        try {
            const data = await entry.handler(parsedArgs, this.context);
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
