import { describe, expect, test } from "bun:test";
import type { LoggingConfig } from "@main/config/schemas";
import { type LogLevel, initLogger } from "@main/utils/logger";

function makeConfig(overrides: Partial<LoggingConfig> = {}): LoggingConfig {
    return {
        verbose: false,
        format: {
            showTime: false,
            showSessionId: false,
            location: {
                enabled: false,
                showFile: false,
                showFunction: false,
                showLine: false,
                showForInfo: false,
                showForDebug: false,
                showForWarning: false,
                showForError: false,
            },
        },
        levels: {
            debug: true,
            info: true,
            warning: true,
            error: true,
            critical: true,
        },
        redaction: {
            enabled: true,
            useDefaultPii: true,
            patterns: [
                {
                    name: "OPENAI_API_KEY",
                    regex: "sk-[a-zA-Z0-9]{20,}",
                    placeholder: "[REDACTED_API_KEY]",
                },
            ],
        },
        ...overrides,
    };
}

interface Captured {
    level: LogLevel;
    line: string;
}

function makeSink(): { sink: (l: LogLevel, line: string) => void; lines: Captured[] } {
    const lines: Captured[] = [];
    return {
        lines,
        sink: (level, line) => lines.push({ level, line }),
    };
}

describe("Logger", () => {
    test("redacts secrets before writing", () => {
        const { sink, lines } = makeSink();
        const logger = initLogger({
            config: makeConfig(),
            sessionId: "test",
            sink,
        });
        logger.info("key is sk-abcdefghijklmnopqrstuvwxyz012345");
        expect(lines).toHaveLength(1);
        expect(lines[0].line).toContain("[REDACTED_API_KEY]");
        expect(lines[0].line).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
    });

    test("honours level toggles", () => {
        const { sink, lines } = makeSink();
        const logger = initLogger({
            config: makeConfig({
                levels: {
                    debug: false,
                    info: false,
                    warning: false,
                    error: true,
                    critical: true,
                },
            }),
            sessionId: "test",
            sink,
        });
        logger.debug("d");
        logger.info("i");
        logger.warn("w");
        logger.error("e");
        logger.critical("c");
        expect(lines.map((l) => l.level)).toEqual(["error", "critical"]);
    });

    test("child loggers prepend scope", () => {
        const { sink, lines } = makeSink();
        const logger = initLogger({
            config: makeConfig(),
            sessionId: "test",
            sink,
        });
        const child = logger.child("ipc");
        const grandchild = child.child("engine");
        child.info("hello");
        grandchild.info("world");
        expect(lines[0].line).toContain("[ipc] hello");
        expect(lines[1].line).toContain("[ipc.engine] world");
    });

    test("formats Error objects with stack", () => {
        const { sink, lines } = makeSink();
        const logger = initLogger({
            config: makeConfig(),
            sessionId: "test",
            sink,
        });
        logger.error("boom", new Error("something broke"));
        expect(lines[0].line).toContain("something broke");
    });
});
