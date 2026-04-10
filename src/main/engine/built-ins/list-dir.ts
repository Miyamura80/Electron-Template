import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";
import { assertAllowedPath } from "./fs-helpers";

const listDirArgsSchema = z.object({
    path: z.string().min(1, "Missing or invalid 'path' (expected non-empty string)"),
});
type ListDirArgs = z.infer<typeof listDirArgsSchema>;

interface DirEntry {
    name: string;
    isDir: boolean;
    sizeBytes: number;
}

async function statEntry(safePath: string, name: string): Promise<DirEntry | null> {
    try {
        const info = await stat(join(safePath, name));
        return {
            name,
            isDir: info.isDirectory(),
            sizeBytes: info.size,
        };
    } catch (err) {
        // TOCTOU: the entry was removed between `readdir` and `stat`. Silently
        // drop it from the listing instead of failing the whole command.
        // Directory listings are inherently racy and callers expect a
        // best-effort snapshot.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

export const listDirCommand: CommandDefinition<ListDirArgs> = {
    name: "list_dir",
    argsSchema: listDirArgsSchema,
    handler: async (args, context: CommandContext) => {
        const safePath = assertAllowedPath(args.path, context.allowedPaths);
        try {
            const names = await readdir(safePath);
            const maybeEntries = await Promise.all(
                names.map((name) => statEntry(safePath, name)),
            );
            const entries = maybeEntries.filter((e): e is DirEntry => e !== null);
            entries.sort((a, b) => a.name.localeCompare(b.name));
            return { entries };
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
                throw new CommandError("io_error", `Directory not found: ${args.path}`);
            }
            if (code === "ENOTDIR") {
                throw new CommandError("io_error", `Not a directory: ${args.path}`);
            }
            throw new CommandError(
                "io_error",
                `Failed to list ${args.path}: ${(err as Error).message}`,
            );
        }
    },
};
