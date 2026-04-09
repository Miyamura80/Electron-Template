import { describe, expect, test } from "bun:test";
import { toFrontendConfig } from "@main/config";
import { createConfig } from "@main/config/loader";

describe("toFrontendConfig", () => {
    test("strips every API key from the projection", () => {
        const config = createConfig();
        const frontend = toFrontendConfig(config);
        const json = JSON.stringify(frontend);
        expect(json).not.toContain("openaiApiKey");
        expect(json).not.toContain("anthropicApiKey");
        expect(json).not.toContain("groqApiKey");
        expect(json).not.toContain("perplexityApiKey");
        expect(json).not.toContain("geminiApiKey");
    });

    test("exposes model info, llm config, and feature flags", () => {
        const config = createConfig();
        const frontend = toFrontendConfig(config);
        expect(frontend.defaultLlm.defaultModel).toBe(config.defaultLlm.defaultModel);
        expect(frontend.llmConfig.cacheEnabled).toBe(config.llmConfig.cacheEnabled);
        expect(frontend.features).toEqual(
            expect.objectContaining({
                newUi: expect.any(Boolean),
                enableLlmFallback: expect.any(Boolean),
            }),
        );
    });
});
