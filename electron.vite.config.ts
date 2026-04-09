import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * electron-vite orchestrates three parallel Vite builds - one per Electron
 * process - and wires the dev server up for hot reload.
 *
 * - main:    Electron main process (Node runtime, out/main/)
 * - preload: Preload scripts (out/preload/, .mjs output for contextBridge)
 * - renderer: React app (out/renderer/, served by Vite in dev mode)
 */
export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "out/main",
            rollupOptions: {
                input: resolve(__dirname, "src/main/index.ts"),
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "out/preload",
            rollupOptions: {
                input: resolve(__dirname, "src/preload/index.ts"),
                output: {
                    format: "es",
                    entryFileNames: "[name].mjs",
                },
            },
        },
    },
    renderer: {
        root: resolve(__dirname, "src/renderer"),
        plugins: [react()],
        build: {
            outDir: "out/renderer",
            rollupOptions: {
                input: resolve(__dirname, "src/renderer/index.html"),
            },
        },
        resolve: {
            alias: {
                "@shared": resolve(__dirname, "src/shared"),
            },
        },
    },
});
