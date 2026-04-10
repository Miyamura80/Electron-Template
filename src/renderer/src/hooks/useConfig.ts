import { useEffect, useState } from "react";
import type { FrontendConfig } from "../../../shared/types";

interface UseConfigResult {
    config: FrontendConfig | null;
    loading: boolean;
    error: string | null;
}

/**
 * Number of times to retry `getAppConfig` before surfacing an error.
 * The total wait across retries is ~3s (300 + 600 + 1200 + 2400 capped),
 * which covers the typical window where the main process is still
 * registering IPC handlers after `app.whenReady()`.
 */
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 2400;

function backoffDelay(attempt: number): number {
    return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

async function fetchConfigWithRetry(signal: AbortSignal): Promise<FrontendConfig> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (signal.aborted) throw signal.reason ?? new Error("aborted");
        try {
            return await window.electronAPI.getAppConfig();
        } catch (err) {
            lastErr = err;
        }
        await sleep(backoffDelay(attempt), signal);
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Fetches the sanitized app config from the main process via IPC.
 *
 * The main process owns all config loading / validation; the renderer is a
 * read-only consumer of a projection that strips secrets.
 *
 * Retries with exponential backoff: a single transient failure (e.g. the
 * renderer mounted before `registerIpcHandlers` ran, or an IPC blip during
 * startup) would otherwise leave the UI permanently stuck on the loading
 * state.
 */
export function useConfig(): UseConfigResult {
    const [config, setConfig] = useState<FrontendConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        fetchConfigWithRetry(controller.signal)
            .then((data) => {
                if (controller.signal.aborted) return;
                setConfig(data);
                setError(null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });

        return () => controller.abort();
    }, []);

    return { config, loading, error };
}
