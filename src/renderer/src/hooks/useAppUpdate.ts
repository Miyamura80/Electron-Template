import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateInfo } from "../../../shared/types";

type UpdateStatus = "idle" | "available" | "downloading" | "ready" | "error";

interface AppUpdateState {
    status: UpdateStatus;
    info: UpdateInfo | null;
    progress: number;
    error: string | null;
    updateNow: () => void;
    remindLater: () => void;
    skipVersion: () => void;
    retry: () => void;
}

const SKIPPED_VERSION_KEY = "electron-template:skipped-update-version";

/**
 * Drives the {@link UpdateNotification} banner.
 *
 * Talks to the main process via `window.electronAPI.updater`, which is a
 * stub until you wire up `electron-updater` (see `src/main/updater.ts`).
 */
export function useAppUpdate(): AppUpdateState {
    const [status, setStatus] = useState<UpdateStatus>("idle");
    const [info, setInfo] = useState<UpdateInfo | null>(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    const checkForUpdate = useCallback(async () => {
        try {
            const update = await window.electronAPI.updater.check();
            if (!update) return;

            const skipped = localStorage.getItem(SKIPPED_VERSION_KEY);
            if (skipped === update.version) return;

            setInfo(update);
            setStatus("available");
            setDismissed(false);
            setError(null);
        } catch (e) {
            console.warn("Update check failed:", e);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(checkForUpdate, 3000);
        return () => clearTimeout(timer);
    }, [checkForUpdate]);

    useEffect(() => {
        // Subscribe to download-progress events only while a download is
        // actually in flight, so we don't leak listeners.
        if (status !== "downloading") return;
        const off = window.electronAPI.updater.onProgress((p) => {
            setProgress(p.percent);
        });
        unsubscribeRef.current = off;
        return () => {
            off();
            unsubscribeRef.current = null;
        };
    }, [status]);

    const updateNow = useCallback(async () => {
        if (!info) return;
        setStatus("downloading");
        setProgress(0);
        setError(null);
        try {
            await window.electronAPI.updater.downloadAndInstall();
            setStatus("ready");
            await window.electronAPI.updater.relaunch();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("error");
        }
    }, [info]);

    const remindLater = useCallback(() => {
        setDismissed(true);
    }, []);

    const skipVersion = useCallback(() => {
        if (info) localStorage.setItem(SKIPPED_VERSION_KEY, info.version);
        setDismissed(true);
    }, [info]);

    const retry = useCallback(async () => {
        await checkForUpdate();
    }, [checkForUpdate]);

    const effectiveStatus = dismissed ? "idle" : status;

    return {
        status: effectiveStatus,
        info,
        progress,
        error,
        updateNow,
        remindLater,
        skipVersion,
        retry,
    };
}
