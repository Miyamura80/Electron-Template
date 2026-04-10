import { arch, cpus, hostname, platform, release, totalmem } from "node:os";
import { z } from "zod";
import type { CommandDefinition } from "../types";

const SystemInfoArgsSchema = z.object({}).passthrough().optional();

export const systemInfoCommand: CommandDefinition = {
    name: "system_info",
    argsSchema: SystemInfoArgsSchema,
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
