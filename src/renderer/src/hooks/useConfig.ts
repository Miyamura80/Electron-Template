import { useEffect, useState } from "react";
import type { FrontendConfig } from "../../../shared/types";

interface UseConfigResult {
    config: FrontendConfig | null;
    loading: boolean;
    error: string | null;
}

/**
 * Fetches the sanitized app config from the main process via IPC.
 *
 * The main process owns all config loading / validation; the renderer is a
 * read-only consumer of a projection that strips secrets.
 */
export function useConfig(): UseConfigResult {
    const [config, setConfig] = useState<FrontendConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        window.electronAPI
            .getAppConfig()
            .then((data) => {
                setConfig(data);
                setLoading(false);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });
    }, []);

    return { config, loading, error };
}
