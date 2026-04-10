import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createConfig } from "@main/config/loader";

describe("Config Loading", () => {
    test("loads config from YAML successfully", () => {
        const config = createConfig();
        expect(config.exampleParent.exampleChild).toBe("example_value");
        expect(config.modelName).toBe("gemini/gemini-3-flash-preview");
    });

    test("has window config with sensible defaults", () => {
        const config = createConfig();
        expect(config.window.title).toBe("Electron-Template");
        expect(config.window.width).toBe(800);
        expect(config.window.height).toBe(600);
    });

    test("has correct default LLM settings", () => {
        const config = createConfig();
        expect(config.defaultLlm.defaultModel).toBe("gemini/gemini-3-flash-preview");
        expect(config.defaultLlm.defaultTemperature).toBe(0.5);
        expect(config.defaultLlm.defaultMaxTokens).toBe(100000);
    });

    test("has logging config", () => {
        const config = createConfig();
        expect(config.logging.levels.info).toBe(true);
        expect(config.logging.levels.debug).toBe(false);
    });

    test("has redaction patterns", () => {
        const config = createConfig();
        expect(config.logging.redaction.enabled).toBe(true);
        expect(config.logging.redaction.patterns.length).toBeGreaterThan(0);
    });

    test("has feature flags", () => {
        const config = createConfig();
        expect(config.features.newUi).toBe(false);
        expect(config.features.enableLlmFallback).toBe(true);
    });

    test("has PostHog config with defaults", () => {
        const config = createConfig();
        expect(config.posthog.enabled).toBe(false);
        expect(config.posthog.host).toBe("https://us.i.posthog.com");
        expect(config.posthog.flushAt).toBe(20);
        expect(config.posthog.flushIntervalMs).toBe(30_000);
    });

    test("sets runtime fields", () => {
        const config = createConfig();
        expect(typeof config.isLocal).toBe("boolean");
        expect(typeof config.runningOn).toBe("string");
    });
});

describe("Config Env Var Override", () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        savedEnv.DEFAULT_LLM__DEFAULT_MAX_TOKENS =
            process.env.DEFAULT_LLM__DEFAULT_MAX_TOKENS;
        savedEnv.FEATURES__NEW_UI = process.env.FEATURES__NEW_UI;
        savedEnv.WINDOW__WIDTH = process.env.WINDOW__WIDTH;
        savedEnv.POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
        savedEnv.POSTHOG__ENABLED = process.env.POSTHOG__ENABLED;
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    test("env vars override nested YAML values", () => {
        process.env.DEFAULT_LLM__DEFAULT_MAX_TOKENS = "99999";
        const config = createConfig();
        expect(config.defaultLlm.defaultMaxTokens).toBe(99999);
    });

    test("env vars override feature flags", () => {
        process.env.FEATURES__NEW_UI = "true";
        const config = createConfig();
        expect(config.features.newUi).toBe(true);
    });

    test("env vars override window dimensions", () => {
        process.env.WINDOW__WIDTH = "1200";
        const config = createConfig();
        expect(config.window.width).toBe(1200);
    });

    test("POSTHOG_API_KEY env var maps to posthogApiKey", () => {
        process.env.POSTHOG_API_KEY = "phc_test_key_123";
        const config = createConfig();
        expect(config.posthogApiKey).toBe("phc_test_key_123");
    });

    test("env vars override PostHog config", () => {
        process.env.POSTHOG__ENABLED = "true";
        const config = createConfig();
        expect(config.posthog.enabled).toBe(true);
    });
});
