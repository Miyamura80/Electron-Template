import type { ZodType } from "zod";
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
export type CommandHandler<TArgs = unknown> = (
    args: TArgs,
    context: CommandContext,
) => unknown | Promise<unknown>;

/**
 * Shape of a registered command (handler + metadata).
 *
 * `argsSchema` is optional but strongly recommended for any command that
 * accepts input: when present, the registry validates `args` with zod
 * *before* dispatching to the handler and turns parse failures into a
 * `fail` result with code `invalid_input`. This keeps handlers focused on
 * the happy path - they can treat their args as already-typed.
 *
 * `handler` is declared with method shorthand on purpose: it gives the
 * parameter bivariant typing, which lets a `CommandDefinition<{path:string}>`
 * fit into a `CommandDefinition<unknown>[]` collection (e.g.
 * `BUILT_IN_COMMANDS`) without the registry having to lie with `any`.
 */
export interface CommandDefinition<TArgs = unknown> {
    name: string;
    argsSchema?: ZodType<TArgs>;
    handler(args: TArgs, context: CommandContext): unknown | Promise<unknown>;
}
