import { BUILT_IN_COMMANDS } from "./built-ins";
import { CommandRegistry } from "./commands";

export { CommandRegistry } from "./commands";
export { CommandError } from "./types";

/**
 * Build a new registry pre-loaded with the built-in commands.
 *
 * Keep this as a factory rather than a module-level singleton so tests and
 * alternate harnesses (e.g. a future CLI) can spin up isolated registries.
 */
export function createEngine(): CommandRegistry {
    const registry = new CommandRegistry();
    registry.registerAll(BUILT_IN_COMMANDS);
    return registry;
}
