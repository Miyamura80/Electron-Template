import { arch, cpus, hostname, platform, release, totalmem } from "node:os";
import type { CommandDefinition } from "../types";

export const systemInfoCommand: CommandDefinition = {
    name: "system_info",
    handler: () => ({
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        release: release(),
        cpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        nodeVersion: process.version,
        electronVersion: process.versions.electron ?? null,
    }),
};
