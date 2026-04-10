import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { PostHog } from "posthog-node";
import type { PosthogConfig } from "./config/schemas";
import { getLogger } from "./utils/logger";

let client: PostHog | null = null;
let distinctId: string | null = null;

/**
 * Resolve a stable anonymous distinct ID for this machine.
 *
 * On first run a UUIDv4 is generated and persisted to `userData`. On
 * subsequent runs the stored ID is reused, giving PostHog a consistent
 * identity without collecting PII.
 */
function resolveDistinctId(): string {
    const dir = app.getPath("userData");
    const filePath = join(dir, "posthog-anonymous-id");
    try {
        if (existsSync(filePath)) {
            const stored = readFileSync(filePath, "utf-8").trim();
            if (stored) return stored;
        }
    } catch {
        // Fall through to generate a fresh ID.
    }
    const id = randomUUID();
    try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, id, "utf-8");
    } catch {
        // Best-effort persistence; a fresh ID each launch is acceptable.
    }
    return id;
}

interface InitAnalyticsOptions {
    config: PosthogConfig;
    apiKey: string | undefined;
}

/**
 * Spin up the PostHog client. Call once during startup, after config and
 * logger are ready but before the first window is created.
 *
 * No-ops silently when PostHog is disabled or no API key is provided so
 * analytics never block the critical startup path.
 */
export function initAnalytics({ config, apiKey }: InitAnalyticsOptions): void {
    const log = getLogger().child("analytics");

    if (!config.enabled) {
        log.info("PostHog disabled by config");
        return;
    }
    if (!apiKey) {
        log.warn("PostHog enabled but POSTHOG_API_KEY is not set - skipping");
        return;
    }

    try {
        distinctId = resolveDistinctId();
        client = new PostHog(apiKey, {
            host: config.host,
            flushAt: config.flushAtMs,
            flushInterval: config.flushIntervalMs,
        });

        client.identify({
            distinctId,
            properties: {
                platform: process.platform,
                arch: process.arch,
                electronVersion: process.versions.electron,
                appVersion: app.getVersion(),
            },
        });

        log.info(`PostHog initialized (host=${config.host})`);
    } catch (err) {
        log.error("PostHog init failed - analytics will be unavailable", err);
        client = null;
    }
}

/**
 * Capture an analytics event. Best-effort: never throws, never blocks.
 */
export function captureEvent(
    event: string,
    properties?: Record<string, unknown>,
): void {
    if (!client || !distinctId) return;
    try {
        client.capture({ distinctId, event, properties });
    } catch {
        // Swallow: analytics must never crash the app.
    }
}

/**
 * Flush pending events and tear down the client. Call from
 * `app.on("will-quit")` so in-flight events are delivered before exit.
 */
export async function shutdownAnalytics(): Promise<void> {
    if (!client) return;
    try {
        await client.shutdown();
    } catch {
        // Best-effort.
    }
    client = null;
}
