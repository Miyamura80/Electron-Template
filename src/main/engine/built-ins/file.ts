import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { type CommandContext, type CommandDefinition, CommandError } from "../types";

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

/**
 * Resolve `filePath` and confirm it sits inside one of the allowed
 * directories. Returns the resolved absolute path on success; throws a
 * `permission_denied` CommandError otherwise.
 *
 * Security notes for template users:
 * - This blocks literal path traversal (`..`) and anything outside the
 *   allowlist supplied to `createEngine({ allowedPaths })`.
 * - It does **not** chase symlinks. If your allowed directories might
 *   contain attacker-controlled symlinks, run `fs.realpath` here too and
 *   re-check against the allowlist.
 * - Keep `allowedPaths` as narrow as possible. `app.getPath("userData")`
 *   is usually a safe default; do not add `/` or the user's home dir.
 */
function assertAllowedPath(filePath: string, allowedPaths: readonly string[]): string {
    const resolved = resolve(filePath);
    const isAllowed = allowedPaths.some((dir) => {
        const resolvedDir = resolve(dir);
        return resolved === resolvedDir || resolved.startsWith(resolvedDir + sep);
    });
    if (!isAllowed) {
        throw new CommandError("permission_denied", `Path not allowed: ${filePath}`);
    }
    return resolved;
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
