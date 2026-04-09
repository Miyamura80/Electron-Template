import type { FrontendConfig } from "../../shared/types";
import { type CreateConfigOptions, createConfig } from "./loader";
import type { Config } from "./schemas";

export { getFlag } from "./flags";
export { getLlmApiKey, identifyProvider } from "./llm-api-key";

let activeConfig: Config | null = null;

/**
 * Initialize the singleton config used by the main process.
 *
 * Call this exactly once during startup (main/index.ts). Tests and scripts
 * that need an ad-hoc instance should use {@link createConfig} directly.
 */
export function initConfig(options?: CreateConfigOptions): Config {
    activeConfig = createConfig(options);
    return activeConfig;
}

/** Retrieve the initialized singleton config. Throws if not initialized. */
export function getConfig(): Config {
    if (!activeConfig) {
        throw new Error("Config not initialized. Call initConfig() during startup.");
    }
    return activeConfig;
}

/**
 * Build the sanitized, renderer-safe view of the config.
 *
 * Strips every API key and any other field we do not want to ship to the
 * renderer process.
 */
export function toFrontendConfig(config: Config): FrontendConfig {
    const features: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(config.features)) {
        features[k] = Boolean(v);
    }
    return {
        modelName: config.modelName,
        devEnv: config.devEnv,
        exampleParent: {
            exampleChild: config.exampleParent.exampleChild,
        },
        defaultLlm: {
            defaultModel: config.defaultLlm.defaultModel,
            fallbackModel: config.defaultLlm.fallbackModel,
            defaultTemperature: config.defaultLlm.defaultTemperature,
            defaultMaxTokens: config.defaultLlm.defaultMaxTokens,
        },
        llmConfig: {
            cacheEnabled: config.llmConfig.cacheEnabled,
            retry: {
                maxAttempts: config.llmConfig.retry.maxAttempts,
                minWaitSeconds: config.llmConfig.retry.minWaitSeconds,
                maxWaitSeconds: config.llmConfig.retry.maxWaitSeconds,
            },
        },
        features,
    };
}
