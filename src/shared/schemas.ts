/**
 * Zod schemas for every value that crosses the IPC boundary.
 *
 * Shared between the main process (to validate renderer-originated
 * arguments) and the preload script (to validate main-originated
 * responses before they reach React). Keeping the schemas here guarantees
 * the two sides can never drift out of sync.
 *
 * This module must stay free of Node-only and Electron-only imports so
 * that the renderer can pull it in through the bundler without dragging
 * native code into the browser context.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  FrontendConfig                                                            */
/* -------------------------------------------------------------------------- */

export const FrontendConfigSchema = z.object({
    modelName: z.string(),
    devEnv: z.string(),
    exampleParent: z.object({
        exampleChild: z.string(),
    }),
    defaultLlm: z.object({
        defaultModel: z.string(),
        fallbackModel: z.string().nullable(),
        defaultTemperature: z.number(),
        defaultMaxTokens: z.number(),
    }),
    llmConfig: z.object({
        cacheEnabled: z.boolean(),
        retry: z.object({
            maxAttempts: z.number(),
            minWaitSeconds: z.number(),
            maxWaitSeconds: z.number(),
        }),
    }),
    features: z.record(z.string(), z.boolean()),
});

/* -------------------------------------------------------------------------- */
/*  CommandResult                                                             */
/* -------------------------------------------------------------------------- */

const CommandStatusSchema = z.enum(["pass", "fail", "skip", "error"]);

const CommandErrorCodeSchema = z.enum([
    "invalid_input",
    "unsupported",
    "unimplemented",
    "dependency_missing",
    "permission_denied",
    "io_error",
    "timeout",
    "internal_error",
]);

const CommandErrorInfoSchema = z.object({
    code: CommandErrorCodeSchema,
    message: z.string(),
});

const CommandEnvSummarySchema = z.object({
    os: z.string(),
    arch: z.string(),
    headless: z.boolean(),
});

const CommandTimingSchema = z.object({
    startedAtMs: z.number(),
    durationMs: z.number(),
});

export const CommandResultSchema = z.object({
    runId: z.string(),
    command: z.string(),
    status: CommandStatusSchema,
    error: CommandErrorInfoSchema.nullable(),
    timing: CommandTimingSchema,
    envSummary: CommandEnvSummarySchema,
    data: z.unknown(),
});

/* -------------------------------------------------------------------------- */
/*  Updater                                                                   */
/* -------------------------------------------------------------------------- */

const UpdateInfoSchema = z.object({
    version: z.string(),
    body: z.string().nullable(),
});

export const UpdateInfoOrNullSchema = UpdateInfoSchema.nullable();

export const UpdateProgressSchema = z.object({
    percent: z.number(),
});

/* -------------------------------------------------------------------------- */
/*  Renderer error reports                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Payload sent from the renderer's top-level ErrorBoundary (or other
 * catch-all) back to the main process so React crashes end up in the
 * structured log instead of disappearing into the devtools console.
 */
export const RendererErrorReportSchema = z.object({
    message: z.string(),
    stack: z.string().nullable().optional(),
    componentStack: z.string().nullable().optional(),
    /** Best-effort location hint such as window.location.href. */
    location: z.string().nullable().optional(),
});

/* -------------------------------------------------------------------------- */
/*  engineCall arguments                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Schema for the tuple of arguments the renderer hands to the
 * `engineCall` IPC handler. Command args default to `{}` so every
 * handler can assume an object.
 */
export const EngineCallArgsSchema = z.tuple([
    z.string().min(1, "engineCall: 'command' must be a non-empty string"),
    z.unknown().optional(),
]);
