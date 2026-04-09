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

/** A command handler receives its args and returns the `data` payload. */
export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;

/** Shape of a registered command (handler + metadata). */
export interface CommandDefinition {
    name: string;
    handler: CommandHandler;
}
