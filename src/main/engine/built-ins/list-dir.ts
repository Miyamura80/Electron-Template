import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";
import { assertAllowedPath, requireString } from "./fs-helpers";

interface ListDirArgs {
    path?: unknown;
}

interface DirEntry {
    name: string;
    isDir: boolean;
    sizeBytes: number;
}

export const listDirCommand: CommandDefinition = {
    name: "list_dir",
    handler: async (args, context: CommandContext) => {
        const { path } = (args ?? {}) as ListDirArgs;
        const dirPath = requireString(path, "path");
        const safePath = assertAllowedPath(dirPath, context.allowedPaths);
        try {
            const names = await readdir(safePath);
            const entries: DirEntry[] = await Promise.all(
                names.map(async (name) => {
                    const full = join(safePath, name);
                    const info = await stat(full);
                    return {
                        name,
                        isDir: info.isDirectory(),
                        sizeBytes: info.size,
                    };
                }),
            );
            entries.sort((a, b) => a.name.localeCompare(b.name));
            return { entries };
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
                throw new CommandError("io_error", `Directory not found: ${dirPath}`);
            }
            if (code === "ENOTDIR") {
                throw new CommandError("io_error", `Not a directory: ${dirPath}`);
            }
            throw new CommandError(
                "io_error",
                `Failed to list ${dirPath}: ${(err as Error).message}`,
            );
        }
    },
};
