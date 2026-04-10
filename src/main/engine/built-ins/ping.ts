import { z } from "zod";
import type { CommandDefinition } from "../types";

// Accept either no args or an empty object - existing tests call ping
// without any args, and the IPC handler defaults missing args to `{}`.
const PingArgsSchema = z.object({}).passthrough().optional();

/** Trivial health-check command. Useful for smoke-testing the IPC bridge. */
export const pingCommand: CommandDefinition = {
    name: "ping",
    argsSchema: PingArgsSchema,
    handler: () => ({ pong: true, at: new Date().toISOString() }),
};
