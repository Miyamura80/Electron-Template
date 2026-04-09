#!/usr/bin/env bun
/**
 * appctl – headless CLI test harness for the engine.
 *
 * Drives the same command registry that the Electron main process uses, but
 * without spinning up an Electron window. Intended for CI smoke tests, VM
 * compatibility checks, and quick local exploration of engine commands.
 *
 * Usage:
 *   bun run scripts/appctl.ts list
 *   bun run scripts/appctl.ts call ping
 *   bun run scripts/appctl.ts call write_file --args '{"path":"/tmp/x","content":"y"}'
 *   bun run scripts/appctl.ts run-scenario scripts/examples/smoke.yaml
 *   bun run scripts/appctl.ts doctor
 *
 * Exit codes:
 *   0 – pass or skip
 *   1 – fail
 *   2 – error (unknown command, malformed input, internal crash)
 */
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createEngine } from "@main/engine";
import type { CommandResult, CommandStatus } from "@shared/types";
import { parse as parseYaml } from "yaml";

interface ScenarioStep {
    call?: string;
    args?: Record<string, unknown>;
    expect_status?: CommandStatus;
    timeout_ms?: number;
}

interface Scenario {
    name?: string;
    steps: ScenarioStep[];
}

function exitCodeFor(status: CommandStatus): number {
    if (status === "pass" || status === "skip") return 0;
    if (status === "fail") return 1;
    return 2;
}

function parseArgsFlag(argv: string[]): Record<string, unknown> {
    const idx = argv.indexOf("--args");
    if (idx === -1) return {};
    const raw = argv[idx + 1];
    if (!raw) {
        throw new Error("--args requires a JSON value");
    }
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
        throw new Error(`--args is not valid JSON: ${(err as Error).message}`);
    }
}

function printJson(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runList(): Promise<number> {
    const engine = createEngine({ allowedPaths: [tmpdir()] });
    for (const name of engine.listCommands()) {
        process.stdout.write(`${name}\n`);
    }
    return 0;
}

async function runCall(argv: string[]): Promise<number> {
    const name = argv[0];
    if (!name) {
        process.stderr.write("Usage: appctl call <command> [--args '<json>']\n");
        return 2;
    }
    const args = parseArgsFlag(argv.slice(1));
    const engine = createEngine({ allowedPaths: [tmpdir()] });
    const result = await engine.execute(name, args);
    printJson(result);
    return exitCodeFor(result.status);
}

async function runDoctor(): Promise<number> {
    const engine = createEngine({ allowedPaths: [tmpdir()] });
    const result = await engine.execute("system_info");
    printJson({
        run_id: result.runId,
        env_summary: result.envSummary,
        system_info: result.data,
    });
    return exitCodeFor(result.status);
}

interface StepRecord {
    step: number;
    name: string;
    result: CommandResult;
}

interface StepOutcome {
    record: StepRecord;
    failed: boolean;
    actual: CommandStatus;
    expected: CommandStatus;
}

/**
 * Substitute `{{variable}}` placeholders inside step args. Supported today:
 *   - {{tmpdir}} -> os.tmpdir() (the exact allowlist path, cross-platform)
 *
 * Scenarios should use these instead of hardcoded paths so they stay portable
 * across macOS (where `/tmp` is outside `tmpdir()`) and Linux.
 */
function interpolateVariables(value: unknown, vars: Record<string, string>): unknown {
    if (typeof value === "string") {
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
            return vars[key] ?? match;
        });
    }
    if (Array.isArray(value)) {
        return value.map((v) => interpolateVariables(v, vars));
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = interpolateVariables(v, vars);
        }
        return out;
    }
    return value;
}

async function executeStep(
    engine: ReturnType<typeof createEngine>,
    step: ScenarioStep,
    index: number,
    vars: Record<string, string>,
): Promise<StepOutcome> {
    const name = step.call as string;
    const args = interpolateVariables(step.args ?? {}, vars) as Record<string, unknown>;
    const result = await engine.execute(name, args);
    const expected = step.expect_status ?? "pass";
    const actual = result.status;
    return {
        record: { step: index + 1, name, result },
        failed: actual !== expected,
        actual,
        expected,
    };
}

function loadScenario(file: string): { path: string; scenario: Scenario } | null {
    const path = resolve(file);
    const text = readFileSync(path, "utf-8");
    const scenario = parseYaml(text) as Scenario;
    if (!scenario || !Array.isArray(scenario.steps)) {
        process.stderr.write(`Invalid scenario file: ${path}\n`);
        return null;
    }
    return { path, scenario };
}

async function runScenario(argv: string[]): Promise<number> {
    const file = argv[0];
    if (!file) {
        process.stderr.write("Usage: appctl run-scenario <file.yaml>\n");
        return 2;
    }

    const loaded = loadScenario(file);
    if (!loaded) return 2;
    const { path: scenarioPath, scenario } = loaded;

    const tmp = tmpdir();
    const vars: Record<string, string> = { tmpdir: tmp };
    const engine = createEngine({ allowedPaths: [tmp] });
    const results: StepRecord[] = [];

    for (let i = 0; i < scenario.steps.length; i += 1) {
        const step = scenario.steps[i];
        if (!step.call) {
            process.stderr.write(`Step ${i + 1} is missing 'call'\n`);
            return 2;
        }
        const outcome = await executeStep(engine, step, i, vars);
        results.push(outcome.record);
        if (outcome.failed) {
            printJson({
                scenario: scenario.name ?? scenarioPath,
                failed_step: i + 1,
                expected_status: outcome.expected,
                actual_status: outcome.actual,
                results,
            });
            return exitCodeFor(outcome.actual === "error" ? "error" : "fail");
        }
    }

    printJson({
        scenario: scenario.name ?? scenarioPath,
        status: "pass",
        steps: results.length,
        results,
    });
    return 0;
}

function printHelp(): void {
    process.stdout.write(
        [
            "appctl – headless engine test harness",
            "",
            "Commands:",
            "  list                                List every registered engine command",
            "  call <name> [--args '<json>']       Invoke a single command",
            "  run-scenario <file.yaml>            Execute a scripted scenario",
            "  doctor                              Dump env summary + system_info",
            "",
            "Exit codes: 0=pass/skip, 1=fail, 2=error",
            "",
        ].join("\n"),
    );
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const command = argv[0];
    const rest = argv.slice(1);

    try {
        let code: number;
        switch (command) {
            case "list":
                code = await runList();
                break;
            case "call":
                code = await runCall(rest);
                break;
            case "run-scenario":
                code = await runScenario(rest);
                break;
            case "doctor":
                code = await runDoctor();
                break;
            case "help":
            case "--help":
            case "-h":
            case undefined:
                printHelp();
                code = command ? 0 : 2;
                break;
            default:
                process.stderr.write(`Unknown command: ${command}\n\n`);
                printHelp();
                code = 2;
        }
        process.exit(code);
    } catch (err) {
        process.stderr.write(`appctl error: ${(err as Error).message}\n`);
        process.exit(2);
    }
}

await main();
