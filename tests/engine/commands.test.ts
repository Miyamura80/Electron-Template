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
import { z } from "zod";

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
        expect(names).toContain("list_dir");
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

    test("read_file rejects wrong-typed path", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("read_file", { path: 42 });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
    });

    test("write_file rejects missing content", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("write_file", {
            path: join(sandbox, "x.txt"),
        });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
    });

    test("list_dir rejects empty path", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("list_dir", { path: "" });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
    });

    test("argsSchema validation runs before the handler", async () => {
        const engine = new CommandRegistry({ allowedPaths: [sandbox] });
        let handlerCalled = false;
        const guardedSchema = z.object({ n: z.number() });
        engine.register({
            name: "guarded",
            argsSchema: guardedSchema,
            handler: () => {
                handlerCalled = true;
                return null;
            },
        });

        const bad = await engine.execute("guarded", { n: "not-a-number" });
        expect(bad.status).toBe("fail");
        expect(bad.error?.code).toBe("invalid_input");
        expect(bad.error?.message).toContain("n");
        expect(handlerCalled).toBe(false);

        const good = await engine.execute("guarded", { n: 1 });
        expect(good.status).toBe("pass");
        expect(handlerCalled).toBe(true);
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

    test("list_dir returns entries inside the sandbox", async () => {
        const subdir = join(sandbox, "sub");
        await mkdir(subdir, { recursive: true });
        await fsWriteFile(join(sandbox, "a.txt"), "one", "utf-8");
        await fsWriteFile(join(sandbox, "b.txt"), "two", "utf-8");

        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("list_dir", { path: sandbox });
        expect(result.status).toBe("pass");
        const entries = (
            result.data as { entries: Array<{ name: string; isDir: boolean }> }
        ).entries;
        const names = entries.map((e) => e.name);
        expect(names).toContain("a.txt");
        expect(names).toContain("b.txt");
        expect(names).toContain("sub");
        const sub = entries.find((e) => e.name === "sub");
        expect(sub?.isDir).toBe(true);
    });

    test("list_dir refuses paths outside the allowlist", async () => {
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("list_dir", { path: outsideSandbox });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("permission_denied");
    });

    test("list_dir fails cleanly on a missing directory", async () => {
        const missing = join(sandbox, "does-not-exist");
        const engine = createEngine({ allowedPaths: [sandbox] });
        const result = await engine.execute("list_dir", { path: missing });
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("io_error");
    });
});
