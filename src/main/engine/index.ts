import { BUILT_IN_COMMANDS } from "./built-ins";
import { CommandRegistry } from "./commands";
import type { CommandContext } from "./types";

export { CommandRegistry } from "./commands";
export { CommandError } from "./types";

/** Options accepted by {@link createEngine}. */
interface CreateEngineOptions {
    /**
     * Directories the filesystem commands may touch. Required - omitting
     * this on purpose forces every caller to make an explicit decision
     * about the blast radius of read_file / write_file.
     *
     * Supply an empty array to disable filesystem access entirely (useful
     * for tests that exercise only the non-IO commands).
     */
    allowedPaths: readonly string[];
}

/**
 * Build a new registry pre-loaded with the built-in commands.
 *
 * Keep this as a factory rather than a module-level singleton so tests and
 * alternate harnesses (e.g. a future CLI) can spin up isolated registries
 * with their own filesystem allowlists.
 */
export function createEngine(options: CreateEngineOptions): CommandRegistry {
    const context: CommandContext = {
        allowedPaths: options.allowedPaths,
    };
    const registry = new CommandRegistry(context);
    registry.registerAll(BUILT_IN_COMMANDS);
    return registry;
}
