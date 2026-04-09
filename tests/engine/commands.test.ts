import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import {
    readFile as fsReadFile,
    writeFile as fsWriteFile,
    mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, CommandRegistry, createEngine } from "@main/engine";

// Scratch directory used as the only allowed path for filesystem tests.
// Using a per-run tmpdir keeps tests hermetic and parallelizable.
let sandbox: string;
let outsideSandbox: string;

beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), "electron-template-engine-"));
    outsideSandbox = mkdtempSync(join(tmpdir(), "electron-template-outside-"));
    await mkdir(sandbox, { recursive: true });
});

afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(outsideSandbox, { recursive: true, force: true });
});

describe("createEngine", () => {
    test("registers every built-in command", () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const names = engine.listCommands();
        expect(names).toContain("ping");
        expect(names).toContain("read_file");
        expect(names).toContain("write_file");
        expect(names).toContain("system_info");
    });

    test("ping returns a pass result", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("ping");
        expect(result.status).toBe("pass");
        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ pong: true });
    });

    test("system_info includes platform info", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("system_info");
        expect(result.status).toBe("pass");
        const data = result.data as Record<string, unknown>;
        expect(typeof data.platform).toBe("string");
        expect(typeof data.arch).toBe("string");
    });

    test("unknown command returns an error result", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("does_not_exist");
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("unsupported");
    });

    test("CommandError from handler becomes a fail result", async () => {
        const engine = new CommandRegistry({ allowedPaths: [sandbox] });
        engine.register("bad_input", () => {
            throw new CommandError("invalid_input", "no args provided");
        });
        const result = await engine.execute("bad_input");
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
        expect(result.error?.message).toBe("no args provided");
    });

    test("uncaught exception becomes an error result", async () => {
        const engine = new CommandRegistry({ allowedPaths: [sandbox] });
        engine.register("boom", () => {
            throw new Error("kaboom");
        });
        const result = await engine.execute("boom");
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("internal_error");
        expect(result.error?.message).toBe("kaboom");
    });

    test("registering the same name twice throws", () => {
        const engine = new CommandRegistry({ allowedPaths: [sandbox] });
        engine.register("same", () => null);
        expect(() => engine.register("same", () => null)).toThrow();
    });

    test("read_file rejects missing path", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("read_file", {});
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
    });
});

describe("filesystem allowlist", () => {
    test("read_file succeeds inside the sandbox", async () => {
        const target = join(sandbox, "allowed.txt");
        await fsWriteFile(target, "hello", "utf-8");

        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("read_file", { path: target });
        expect(result.status).toBe("pass");
        expect((result.data as { content: string }).content).toBe("hello");
    });

    test("read_file refuses paths outside the allowlist", async () => {
        const outsider = join(outsideSandbox, "secret.txt");
        await fsWriteFile(outsider, "top-secret", "utf-8");

        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("read_file", { path: outsider });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("permission_denied");
        // The file must not be touched - verify the sandbox didn't leak.
        expect(await fsReadFile(outsider, "utf-8")).toBe("top-secret");
    });

    test("read_file refuses path traversal attacks", async () => {
        const traversal = join(sandbox, "..", "..", "etc", "passwd");
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("read_file", { path: traversal });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("permission_denied");
    });

    test("write_file succeeds inside the sandbox", async () => {
        const target = join(sandbox, "written.txt");
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("write_file", {
            path: target,
            content: "fresh",
        });
        expect(result.status).toBe("pass");
        expect(await fsReadFile(target, "utf-8")).toBe("fresh");
    });

    test("write_file refuses paths outside the allowlist", async () => {
        const outsider = join(outsideSandbox, "should-not-exist.txt");
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("write_file", {
            path: outsider,
            content: "nope",
        });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("permission_denied");
    });

    test("empty allowlist blocks every filesystem call", async () => {
        const engine = createEngine({ allowedPaths: [] });
        const result = await engine.execute("read_file", {
            path: join(sandbox, "anything.txt"),
        });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("permission_denied");
    });
});
