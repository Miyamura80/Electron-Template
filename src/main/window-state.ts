import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BrowserWindow, app, screen } from "electron";
import { getLogger } from "./utils/logger";

/**
 * Saved window geometry. `x`/`y` may be undefined on first launch.
 */
interface SavedWindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
    isFullScreen: boolean;
}

interface WindowStateOptions {
    defaults: { width: number; height: number };
    /** Override the storage path (useful for tests). */
    filePath?: string;
}

function defaultStoragePath(): string {
    return join(app.getPath("userData"), "window-state.json");
}

/**
 * Load + validate a previously saved window state. Returns `null` if no
 * valid state exists, so the caller can fall back to defaults.
 */
function load(filePath: string): SavedWindowState | null {
    if (!existsSync(filePath)) return null;
    try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return null;
        const p = parsed as Record<string, unknown>;
        if (typeof p.width !== "number" || typeof p.height !== "number") return null;
        if (p.width < 100 || p.height < 100) return null;
        return {
            x: typeof p.x === "number" ? p.x : undefined,
            y: typeof p.y === "number" ? p.y : undefined,
            width: p.width,
            height: p.height,
            isMaximized: Boolean(p.isMaximized),
            isFullScreen: Boolean(p.isFullScreen),
        };
    } catch (err) {
        getLogger().child("window-state").warn("failed to read saved state", err);
        return null;
    }
}

/**
 * Minimum number of pixels of the title bar that must remain visible on
 * a connected display for us to consider the saved x/y "still on screen".
 * Allows partial overlap (windows on the seam between two monitors are
 * fine) but rejects bounds that are entirely off-screen, e.g. after a
 * second monitor is unplugged.
 */
const MIN_VISIBLE_PIXELS = 64;

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function intersects(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/**
 * True if the saved x/y bounds overlap any connected display by at least
 * `MIN_VISIBLE_PIXELS` in both dimensions. Returns true when no x/y was
 * saved at all (first launch).
 */
function visibleOnAnyDisplay(state: SavedWindowState): boolean {
    if (state.x === undefined || state.y === undefined) return true;
    const rect: Rect = {
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
    };
    const slack = MIN_VISIBLE_PIXELS;
    return screen.getAllDisplays().some((d) => {
        const b = d.bounds;
        // Require at least `slack` pixels of overlap in each axis so the
        // user can still grab the title bar after a monitor reshuffle.
        return (
            intersects(rect, b) &&
            Math.min(rect.x + rect.width, b.x + b.width) - Math.max(rect.x, b.x) >=
                slack &&
            Math.min(rect.y + rect.height, b.y + b.height) - Math.max(rect.y, b.y) >=
                slack
        );
    });
}

/**
 * Clamp the saved width/height to the primary display's work area so a
 * window saved at 4K dimensions on a 1080p replacement monitor doesn't
 * spawn larger than the screen.
 */
function clampSize(
    width: number,
    height: number,
    defaults: { width: number; height: number },
): { width: number; height: number } {
    let workArea: Electron.Rectangle | null = null;
    try {
        workArea = screen.getPrimaryDisplay().workArea;
    } catch {
        // `screen` is unavailable in unit tests; fall through to defaults.
    }
    if (!workArea) return { width: defaults.width, height: defaults.height };
    return {
        width: Math.max(100, Math.min(width, workArea.width)),
        height: Math.max(100, Math.min(height, workArea.height)),
    };
}

/**
 * Load the saved state (if any) and merge with `defaults`. Always returns a
 * usable geometry; if the saved bounds are off-screen, the window is
 * recentered on the primary display while still preserving any
 * maximized/fullscreen intent the user had at last shutdown.
 */
export function getInitialWindowState(options: WindowStateOptions): SavedWindowState {
    const filePath = options.filePath ?? defaultStoragePath();
    const saved = load(filePath);
    if (!saved) {
        return {
            width: options.defaults.width,
            height: options.defaults.height,
            isMaximized: false,
            isFullScreen: false,
        };
    }

    if (visibleOnAnyDisplay(saved)) return saved;

    // Bounds are off-screen (monitor unplugged, resolution change, etc.).
    // Drop x/y so Electron centers the window on the primary display, but
    // keep the user's maximized/fullscreen intent if any - those will be
    // applied to the primary display by the caller in `ready-to-show`.
    const { width, height } = clampSize(saved.width, saved.height, options.defaults);
    return {
        width,
        height,
        isMaximized: saved.isMaximized,
        isFullScreen: saved.isFullScreen,
    };
}

/**
 * Persist `win`'s geometry on close / move / resize. Returns a disposer that
 * removes the listeners - call it when the window is permanently destroyed.
 */
export function attachWindowStateSaver(
    win: BrowserWindow,
    options: WindowStateOptions,
): () => void {
    const filePath = options.filePath ?? defaultStoragePath();
    const log = getLogger().child("window-state");

    const save = (): void => {
        if (win.isDestroyed()) return;
        try {
            const bounds = win.getNormalBounds();
            const state: SavedWindowState = {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                isMaximized: win.isMaximized(),
                isFullScreen: win.isFullScreen(),
            };
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
        } catch (err) {
            log.warn("failed to save window state", err);
        }
    };

    // Debounce-ish: save on close, and on explicit move/resize end.
    win.on("close", save);
    win.on("moved", save);
    win.on("resized", save);

    return () => {
        win.removeListener("close", save);
        win.removeListener("moved", save);
        win.removeListener("resized", save);
    };
}
