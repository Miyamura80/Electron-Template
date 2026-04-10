import { readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";
import { assertAllowedPath } from "./fs-helpers";

const readFileArgsSchema = z.object({
    path: z.string().min(1, "Missing or invalid 'path' (expected non-empty string)"),
});
type ReadFileArgs = z.infer<typeof readFileArgsSchema>;

const writeFileArgsSchema = z.object({
    path: z.string().min(1, "Missing or invalid 'path' (expected non-empty string)"),
    content: z.string(),
});
type WriteFileArgs = z.infer<typeof writeFileArgsSchema>;

export const readFileCommand: CommandDefinition<ReadFileArgs> = {
    name: "read_file",
    argsSchema: readFileArgsSchema,
    handler: async (args, context: CommandContext) => {
        const safePath = assertAllowedPath(args.path, context.allowedPaths);
        try {
            const content = await readFile(safePath, "utf-8");
            const info = await stat(safePath);
            return { content, sizeBytes: info.size };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                throw new CommandError("io_error", `File not found: ${args.path}`);
            }
            throw new CommandError(
                "io_error",
                `Failed to read ${args.path}: ${(err as Error).message}`,
            );
        }
    },
};

export const writeFileCommand: CommandDefinition<WriteFileArgs> = {
    name: "write_file",
    argsSchema: writeFileArgsSchema,
    handler: async (args, context: CommandContext) => {
        const safePath = assertAllowedPath(args.path, context.allowedPaths);
        try {
            await writeFile(safePath, args.content, "utf-8");
            return { bytesWritten: Buffer.byteLength(args.content, "utf-8") };
        } catch (err) {
            throw new CommandError(
                "io_error",
                `Failed to write ${args.path}: ${(err as Error).message}`,
            );
        }
    },
};
