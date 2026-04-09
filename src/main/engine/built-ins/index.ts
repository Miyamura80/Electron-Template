import type { CommandDefinition } from "../types";
import { readFileCommand, writeFileCommand } from "./file";
import { pingCommand } from "./ping";
import { systemInfoCommand } from "./system";

/** Every command registered by default on a fresh engine. */
export const BUILT_IN_COMMANDS: CommandDefinition[] = [
    pingCommand,
    readFileCommand,
    writeFileCommand,
    systemInfoCommand,
];
