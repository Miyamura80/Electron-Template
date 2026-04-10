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

    // Holds the unsubscribe function for the in-flight download-progress
    // subscription, if any. Used as a ref-based abort handle so the listener
    // can be torn down deterministically from any code path - the download
    // `finally`, a re-entrant `updateNow` call, or component unmount - and
    // never leaks listeners across re-renders or error paths.
    const unsubscribeRef = useRef<(() => void) | null>(null);

    const abortProgressListener = useCallback(() => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
    }, []);

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

    // Belt-and-braces unmount cleanup: even if a download outlives the
    // component (e.g. user navigates away mid-download), the ref-based abort
    // tears the listener down so the bridge never holds a stale callback.
    useEffect(() => {
        return () => {
            abortProgressListener();
        };
    }, [abortProgressListener]);

    const updateNow = useCallback(async () => {
        if (!info) return;

        // Drop any prior subscription before starting a new one. Without
        // this a re-entrant call (double-click on "Update now") would
        // double-subscribe and leak the first listener until its `finally`
        // ran.
        abortProgressListener();

        setStatus("downloading");
        setProgress(0);
        setError(null);

        // Subscribe BEFORE invoking IPC so the first progress tick isn't
        // lost, and unsubscribe in `finally` so the listener lifetime is
        // bound exactly to the download - resolved, rejected, or otherwise.
        const off = window.electronAPI.updater.onProgress((p) => {
            setProgress(p.percent);
        });
        unsubscribeRef.current = off;

        try {
            await window.electronAPI.updater.downloadAndInstall();
            setStatus("ready");
            await window.electronAPI.updater.relaunch();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("error");
        } finally {
            abortProgressListener();
        }
    }, [info, abortProgressListener]);

    const remindLater = useCallback(() => {
        setDismissed(true);
    }, []);

    const skipVersion = useCallback(() => {
        if (info) localStorage.setItem(SKIPPED_VERSION_KEY, info.version);
        setDismissed(true);
    }, [info]);

    const retry = useCallback(async () => {
        // Retry specifically re-attempts the failed download-and-install,
        // not the availability check. updateNow already guards on `info`
        // being set, clears the previous error, and flips status back to
        // "downloading" so the banner UI is updated correctly.
        await updateNow();
    }, [updateNow]);

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
