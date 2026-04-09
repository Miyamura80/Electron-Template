import { describe, expect, test } from "bun:test";
import { CommandError, CommandRegistry, createEngine } from "@main/engine";

describe("createEngine", () => {
    test("registers every built-in command", () => {
        const engine = createEngine();
        const names = engine.listCommands();
        expect(names).toContain("ping");
        expect(names).toContain("read_file");
        expect(names).toContain("write_file");
        expect(names).toContain("system_info");
    });

    test("ping returns a pass result", async () => {
        const engine = createEngine();
        const result = await engine.execute("ping");
        expect(result.status).toBe("pass");
        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ pong: true });
    });

    test("system_info includes platform info", async () => {
        const engine = createEngine();
        const result = await engine.execute("system_info");
        expect(result.status).toBe("pass");
        const data = result.data as Record<string, unknown>;
        expect(typeof data.platform).toBe("string");
        expect(typeof data.arch).toBe("string");
    });

    test("unknown command returns an error result", async () => {
        const engine = createEngine();
        const result = await engine.execute("does_not_exist");
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("unsupported");
    });

    test("CommandError from handler becomes a fail result", async () => {
        const engine = new CommandRegistry();
        engine.register("bad_input", () => {
            throw new CommandError("invalid_input", "no args provided");
        });
        const result = await engine.execute("bad_input");
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
        expect(result.error?.message).toBe("no args provided");
    });

    test("uncaught exception becomes an error result", async () => {
        const engine = new CommandRegistry();
        engine.register("boom", () => {
            throw new Error("kaboom");
        });
        const result = await engine.execute("boom");
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("internal_error");
        expect(result.error?.message).toBe("kaboom");
    });

    test("registering the same name twice throws", () => {
        const engine = new CommandRegistry();
        engine.register("same", () => null);
        expect(() => engine.register("same", () => null)).toThrow();
    });

    test("read_file rejects missing path", async () => {
        const engine = createEngine();
        const result = await engine.execute("read_file", {});
        expect(result.status).toBe("fail");
        expect(result.error?.code).toBe("invalid_input");
    });
});
