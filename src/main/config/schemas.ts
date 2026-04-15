import { z } from "zod";

export const ExampleParentSchema = z.object({
    exampleChild: z.string(),
});

export const DefaultLlmSchema = z.object({
    defaultModel: z.string(),
    fallbackModel: z.string().nullable().default(null),
    defaultTemperature: z.number(),
    defaultMaxTokens: z.number().int(),
});

export const RetryConfigSchema = z.object({
    maxAttempts: z.number().int(),
    minWaitSeconds: z.number().int(),
    maxWaitSeconds: z.number().int(),
});

export const LlmConfigSchema = z.object({
    cacheEnabled: z.boolean(),
    retry: RetryConfigSchema,
});

export const WindowConfigSchema = z.object({
    title: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    minWidth: z.number().int().default(400),
    minHeight: z.number().int().default(300),
});

export const LoggingLocationConfigSchema = z.object({
    enabled: z.boolean(),
    showFile: z.boolean(),
    showFunction: z.boolean(),
    showLine: z.boolean(),
    showForInfo: z.boolean(),
    showForDebug: z.boolean(),
    showForWarning: z.boolean(),
    showForError: z.boolean(),
});

export const LoggingFormatConfigSchema = z.object({
    showTime: z.boolean(),
    showSessionId: z.boolean(),
    location: LoggingLocationConfigSchema,
});

export const LoggingLevelsConfigSchema = z.object({
    debug: z.boolean(),
    info: z.boolean(),
    warning: z.boolean(),
    error: z.boolean(),
    critical: z.boolean(),
});

export const RedactionPatternSchema = z.object({
    name: z.string(),
    regex: z.string(),
    placeholder: z.string(),
});

export const RedactionConfigSchema = z.object({
    enabled: z.boolean().default(true),
    useDefaultPii: z.boolean().default(true),
    patterns: z.array(RedactionPatternSchema).default([]),
});

export const LoggingConfigSchema = z.object({
    verbose: z.boolean(),
    format: LoggingFormatConfigSchema,
    levels: LoggingLevelsConfigSchema,
    redaction: RedactionConfigSchema.default({
        enabled: true,
        useDefaultPii: true,
        patterns: [],
    }),
});

export const PosthogConfigSchema = z.object({
    enabled: z.boolean().default(false),
    host: z.string().default("https://us.i.posthog.com"),
    /** Number of captured events before an automatic flush (default: 20). */
    flushAt: z.number().int().default(20),
    /** Milliseconds between automatic flushes (default: 30 000). */
    flushIntervalMs: z.number().int().default(30_000),
});

export const FeaturesConfigSchema = z.record(z.string(), z.boolean());

export const ConfigSchema = z.object({
    modelName: z.string(),
    dotGlobalConfigHealthCheck: z.boolean(),
    devEnv: z.string(),
    window: WindowConfigSchema,
    exampleParent: ExampleParentSchema,
    defaultLlm: DefaultLlmSchema,
    llmConfig: LlmConfigSchema,
    logging: LoggingConfigSchema,
    posthog: PosthogConfigSchema.default({
        enabled: false,
        host: "https://us.i.posthog.com",
        flushAt: 20,
        flushIntervalMs: 30_000,
    }),
    features: FeaturesConfigSchema.default({}),
    openaiApiKey: z.string().optional(),
    anthropicApiKey: z.string().optional(),
    groqApiKey: z.string().optional(),
    perplexityApiKey: z.string().optional(),
    geminiApiKey: z.string().optional(),
    posthogApiKey: z.string().optional(),
    isLocal: z.boolean(),
    runningOn: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type WindowConfig = z.infer<typeof WindowConfigSchema>;
export type ExampleParent = z.infer<typeof ExampleParentSchema>;
export type DefaultLlm = z.infer<typeof DefaultLlmSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type RedactionPattern = z.infer<typeof RedactionPatternSchema>;
export type PosthogConfig = z.infer<typeof PosthogConfigSchema>;
