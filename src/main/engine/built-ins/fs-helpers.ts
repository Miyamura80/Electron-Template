import { resolve, sep } from "node:path";
import { CommandError } from "../types";

/** Throws `invalid_input` if `value` is not a non-empty string. */
export function requireString(value: unknown, field: string): string {
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
export function assertAllowedPath(
    filePath: string,
    allowedPaths: readonly string[],
): string {
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
