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
 * Verify that saved bounds still intersect a connected display - otherwise
 * the window would restore off-screen (e.g. after unplugging a monitor).
 */
function withinDisplay(state: SavedWindowState): boolean {
    if (state.x === undefined || state.y === undefined) return true;
    // Narrow into local consts so TS remembers the undefined guard inside
    // the callback below - the early return already covers both fields.
    const { x, y, width, height } = state;
    const displays = screen.getAllDisplays();
    return displays.some((d) => {
        const b = d.bounds;
        return (
            x >= b.x &&
            y >= b.y &&
            x + width <= b.x + b.width &&
            y + height <= b.y + b.height
        );
    });
}

/**
 * Load the saved state (if any) and merge with `defaults`. Always returns a
 * usable geometry; if the saved state is invalid or off-screen, defaults win.
 */
export function getInitialWindowState(options: WindowStateOptions): SavedWindowState {
    const filePath = options.filePath ?? defaultStoragePath();
    const saved = load(filePath);
    if (saved && withinDisplay(saved)) return saved;
    return {
        width: options.defaults.width,
        height: options.defaults.height,
        isMaximized: false,
        isFullScreen: false,
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
