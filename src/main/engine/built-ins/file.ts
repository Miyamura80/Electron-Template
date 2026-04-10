import { readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";
import { assertAllowedPath } from "./fs-helpers";

const ReadFileArgsSchema = z.object({
    path: z.string().min(1, "expected non-empty string"),
});

const WriteFileArgsSchema = z.object({
    path: z.string().min(1, "expected non-empty string"),
    content: z.string(),
});

type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>;
type WriteFileArgs = z.infer<typeof WriteFileArgsSchema>;

export const readFileCommand: CommandDefinition<ReadFileArgs> = {
    name: "read_file",
    argsSchema: ReadFileArgsSchema,
    handler: async (args, context: CommandContext) => {
        const { path: filePath } = args;
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

export const writeFileCommand: CommandDefinition<WriteFileArgs> = {
    name: "write_file",
    argsSchema: WriteFileArgsSchema,
    handler: async (args, context: CommandContext) => {
        const { path: filePath, content: data } = args;
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
