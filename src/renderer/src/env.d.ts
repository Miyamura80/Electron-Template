/// <reference types="vite/client" />
import type { ElectronAPI } from "../../shared/types";

declare global {
    interface Window {
        /** Injected by the preload script via contextBridge. */
        electronAPI: ElectronAPI;
    }
}
