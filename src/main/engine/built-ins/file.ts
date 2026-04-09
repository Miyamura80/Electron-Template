import { readFile, stat, writeFile } from "node:fs/promises";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";
import { assertAllowedPath, requireString } from "./fs-helpers";

interface ReadFileArgs {
    path?: unknown;
}

interface WriteFileArgs {
    path?: unknown;
    content?: unknown;
}

export const readFileCommand: CommandDefinition = {
    name: "read_file",
    handler: async (args, context: CommandContext) => {
        const { path } = (args ?? {}) as ReadFileArgs;
        const filePath = requireString(path, "path");
        const safePath = assertAllowedPath(filePath, context.allowedPaths);
        try {
            const content = await readFile(safePath, "utf-8");
            const info = await stat(safePath);
            return { content, sizeBytes: info.size };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                throw new CommandError("io_error", `File not found: ${filePath}`);
            }
            throw new CommandError(
                "io_error",
                `Failed to read ${filePath}: ${(err as Error).message}`,
            );
        }
    },
};

export const writeFileCommand: CommandDefinition = {
    name: "write_file",
    handler: async (args, context: CommandContext) => {
        const { path, content } = (args ?? {}) as WriteFileArgs;
        const filePath = requireString(path, "path");
        const data = requireString(content, "content");
        const safePath = assertAllowedPath(filePath, context.allowedPaths);
        try {
            await writeFile(safePath, data, "utf-8");
            return { bytesWritten: Buffer.byteLength(data, "utf-8") };
        } catch (err) {
            throw new CommandError(
                "io_error",
                `Failed to write ${filePath}: ${(err as Error).message}`,
            );
        }
    },
};
