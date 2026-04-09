import type { Config } from "./schemas";

/**
 * Read a feature flag from the validated config.
 *
 * Env var overrides (`FEATURES__NEW_UI=true`) are already applied by the
 * config loader, so this just reads from the resulting object.
 */
export function getFlag(
    config: Config,
    flagName: string,
    defaultValue = false,
): boolean {
    const value = config.features[flagName];
    if (typeof value === "boolean") return value;
    return defaultValue;
}
