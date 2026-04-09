import { readFile, stat, writeFile } from "node:fs/promises";
import { type CommandDefinition, CommandError } from "../types";

interface ReadFileArgs {
    path?: unknown;
}

interface WriteFileArgs {
    path?: unknown;
    content?: unknown;
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new CommandError(
            "invalid_input",
            `Missing or invalid '${field}' (expected non-empty string)`,
        );
    }
    return value;
}

export const readFileCommand: CommandDefinition = {
    name: "read_file",
    handler: async (args) => {
        const { path } = (args ?? {}) as ReadFileArgs;
        const filePath = requireString(path, "path");
        try {
            const content = await readFile(filePath, "utf-8");
            const info = await stat(filePath);
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
    handler: async (args) => {
        const { path, content } = (args ?? {}) as WriteFileArgs;
        const filePath = requireString(path, "path");
        const data = requireString(content, "content");
        try {
            await writeFile(filePath, data, "utf-8");
            return { bytesWritten: Buffer.byteLength(data, "utf-8") };
        } catch (err) {
            throw new CommandError(
                "io_error",
                `Failed to write ${filePath}: ${(err as Error).message}`,
            );
        }
    },
};
