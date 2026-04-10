import type { CommandDefinition } from "../types";
import { readFileCommand, writeFileCommand } from "./file";
import { listDirCommand } from "./list-dir";
import { pingCommand } from "./ping";
import { systemInfoCommand } from "./system";

/**
 * Every command registered by default on a fresh engine.
 *
 * The cast is safe: each entry is a `CommandDefinition<SpecificArgs>` and
 * the registry only ever calls the handler with the parsed result of the
 * matching `argsSchema`. Variance on the args type-parameter would make
 * `CommandDefinition[]` incompatible otherwise.
 */
export const BUILT_IN_COMMANDS: CommandDefinition[] = [
    pingCommand,
    readFileCommand as CommandDefinition,
    writeFileCommand as CommandDefinition,
    listDirCommand as CommandDefinition,
    systemInfoCommand,
];
