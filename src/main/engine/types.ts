import type {
    CommandEnvSummary,
    CommandErrorCode,
    CommandErrorInfo,
    CommandResult,
    CommandStatus,
    CommandTiming,
} from "../../shared/types";

export type {
    CommandErrorCode,
    CommandErrorInfo,
    CommandEnvSummary,
    CommandStatus,
    CommandTiming,
    CommandResult,
};

/**
 * A single validation issue surfaced by an {@link ArgsValidator}.
 *
 * `path` matches zod's `PropertyKey[]` shape (which can include symbols)
 * so any `z.ZodType` satisfies this interface structurally.
 */
export interface ValidationIssue {
    path: readonly PropertyKey[];
    message: string;
}

/**
 * Result returned by {@link ArgsValidator.safeParse}. Mirrors zod's
 * `SafeParseReturnType` shape so any `z.ZodType` satisfies the interface
 * structurally - we keep our own definition to avoid pinning a specific
 * zod major version in the engine's public API.
 */
export type ArgsValidationResult<T> =
    | { success: true; data: T }
    | { success: false; error: { issues: readonly ValidationIssue[] } };

/** Minimal structural type for anything `.safeParse`-able. */
export interface ArgsValidator<T = unknown> {
    safeParse(input: unknown): ArgsValidationResult<T>;
}

/**
 * Thrown inside a command handler to produce a structured `fail` result.
 *
 * Any uncaught exception is mapped to `error` with code `internal_error`.
 */
export class CommandError extends Error {
    constructor(
        public readonly code: CommandErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "CommandError";
    }
}

/**
 * Runtime context every command handler receives as a second argument.
 *
 * Any host-provided capability that must not be derived from command args
 * (filesystem allowlist, network policy, etc.) belongs here so the engine
 * itself stays Electron-agnostic and easy to unit-test.
 */
export interface CommandContext {
    /**
     * Directories the filesystem commands are allowed to read from or write
     * to. Anything outside of these is rejected with `permission_denied`.
     *
     * Paths are expected to be absolute. An empty list disables all
     * filesystem access (handy for tests that want to lock things down).
     */
    readonly allowedPaths: readonly string[];
}

/** A command handler receives its args + runtime context, returns the `data` payload. */
export type CommandHandler<Args = unknown> = (
    args: Args,
    context: CommandContext,
) => unknown | Promise<unknown>;

/**
 * Shape of a registered command.
 *
 * If `argsSchema` is provided, the registry validates the caller's input
 * against it before the handler runs. A validation failure surfaces as a
 * `fail` result with code `invalid_input` - handlers never see malformed
 * input, so they can treat their `args` as trusted.
 */
export interface CommandDefinition<Args = unknown> {
    name: string;
    handler: CommandHandler<Args>;
    argsSchema?: ArgsValidator<Args>;
}
