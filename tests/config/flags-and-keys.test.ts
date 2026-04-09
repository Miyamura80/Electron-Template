import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getFlag, getLlmApiKey, identifyProvider } from "@main/config";
import { createConfig } from "@main/config/loader";

describe("getFlag", () => {
    test("reads a boolean flag from config", () => {
        const config = createConfig();
        expect(getFlag(config, "enableLlmFallback")).toBe(true);
        expect(getFlag(config, "newUi")).toBe(false);
    });

    test("returns default when flag is missing", () => {
        const config = createConfig();
        expect(getFlag(config, "does_not_exist", true)).toBe(true);
        expect(getFlag(config, "does_not_exist")).toBe(false);
    });
});

describe("identifyProvider", () => {
    test("recognizes known providers", () => {
        expect(identifyProvider("gpt-4o")).toBe("openai");
        expect(identifyProvider("o3-mini")).toBe("openai");
        expect(identifyProvider("claude-3-opus")).toBe("anthropic");
        expect(identifyProvider("groq/llama")).toBe("groq");
        expect(identifyProvider("perplexity-online")).toBe("perplexity");
        expect(identifyProvider("gemini/gemini-3-flash")).toBe("gemini");
    });

    test("returns 'unknown' for unrecognized models", () => {
        expect(identifyProvider("mystery-model")).toBe("unknown");
    });
});

describe("getLlmApiKey", () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = undefined;
    });

    afterEach(() => {
        if (savedKey === undefined) {
            process.env.ANTHROPIC_API_KEY = undefined;
        } else {
            process.env.ANTHROPIC_API_KEY = savedKey;
        }
    });

    test("throws when the provider key is missing", () => {
        const config = createConfig();
        expect(() => getLlmApiKey(config, "gpt-4")).toThrow(/openai/i);
    });

    test("returns the matching API key when configured", () => {
        process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
        const config = createConfig();
        expect(getLlmApiKey(config, "claude-3")).toBe("sk-ant-test-key");
    });
});
