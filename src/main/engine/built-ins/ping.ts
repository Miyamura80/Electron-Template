import type { CommandDefinition } from "../types";

/** Trivial health-check command. Useful for smoke-testing the IPC bridge. */
export const pingCommand: CommandDefinition = {
    name: "ping",
    handler: () => ({ pong: true, at: new Date().toISOString() }),
};
