import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { type Config, ConfigSchema } from "./schemas";
import {
    coerceValue,
    envKeyToCamel,
    recursiveKeyTransform,
    recursiveUpdate,
    snakeToCamel,
} from "./utils";

// Only env vars whose top-level key matches a config field are treated as
// overrides. This prevents system env vars like __CF_USER_TEXT_ENCODING from
// polluting the config tree.
const CONFIG_ENV_PREFIXES = new Set(
    Object.keys(ConfigSchema.shape).map((k) => k.toLowerCase()),
);

const RESERVED_YAML_FILES = new Set([
    "global-config.yaml",
    "production-config.yaml",
    ".global-config.yaml",
]);

/** Options passed to {@link createConfig}. */
export interface CreateConfigOptions {
    /**
     * Directory containing `global-config.yaml` (and any split YAML files).
     * Defaults to `<cwd>/resources` so tests and Electron dev mode both work
     * without extra wiring.
     */
    resourcesDir?: string;
    /**
     * Project root used to locate the optional `.global-config.yaml` override
     * at the top level. Defaults to `process.cwd()`.
     */
    projectRoot?: string;
}

function loadYamlFile(path: string): Record<string, unknown> {
    const text = readFileSync(path, "utf-8");
    return (parseYaml(text) as Record<string, unknown>) ?? {};
}

function loadYamlFiles(
    resourcesDir: string,
    projectRoot: string,
): Record<string, unknown> {
    const basePath = join(resourcesDir, "global-config.yaml");
    if (!existsSync(basePath)) {
        throw new Error(`Required config file not found: ${basePath}`);
    }
    const config = loadYamlFile(basePath);

    // Optional: merge adjacent split YAML files (one top-level key per file)
    const files = readdirSync(resourcesDir).filter(
        (f) => f.endsWith(".yaml") && !RESERVED_YAML_FILES.has(f),
    );
    for (const file of files.sort()) {
        const rootKey = file.replace(/\.yaml$/, "");
        if (rootKey in config) {
            throw new Error(
                `Config conflict: key '${rootKey}' from '${file}' already exists in global-config.yaml`,
            );
        }
        const data = parseYaml(readFileSync(join(resourcesDir, file), "utf-8"));
        if (data != null) {
            config[rootKey] = data;
        }
    }

    // Production overlay
    if (process.env.DEV_ENV === "prod") {
        const prodPath = join(resourcesDir, "production-config.yaml");
        if (existsSync(prodPath)) {
            recursiveUpdate(config, loadYamlFile(prodPath));
        }
    }

    // Local override (highest YAML priority). Lives at the project root so
    // local devs can shadow resources/global-config.yaml without touching it.
    const localOverridePath = join(projectRoot, ".global-config.yaml");
    if (existsSync(localOverridePath)) {
        recursiveUpdate(config, loadYamlFile(localOverridePath));
    }

    return config;
}

function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
    for (const [key, rawValue] of Object.entries(process.env)) {
        if (!key.includes("__") || rawValue === undefined) continue;
        const parts = key.split("__").map(envKeyToCamel);
        if (!CONFIG_ENV_PREFIXES.has(parts[0].toLowerCase())) continue;

        let target = config;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (typeof target[part] !== "object" || target[part] === null) {
                target[part] = {};
            }
            target = target[part] as Record<string, unknown>;
        }
        target[parts[parts.length - 1]] = coerceValue(rawValue);
    }
    return config;
}

/**
 * Build a fresh, validated {@link Config} from disk + environment.
 *
 * Called once at main-process startup; tests call it directly to inspect
 * override behavior without a long-lived singleton.
 */
export function createConfig(options: CreateConfigOptions = {}): Config {
    const projectRoot = options.projectRoot ?? process.cwd();
    const resourcesDir = options.resourcesDir ?? resolve(projectRoot, "resources");

    const rawYaml = loadYamlFiles(resourcesDir, projectRoot);
    const camelCased = recursiveKeyTransform(rawYaml, snakeToCamel) as Record<
        string,
        unknown
    >;

    // Direct-mapped env vars (not nested under __)
    if (process.env.DEV_ENV) {
        camelCased.devEnv = process.env.DEV_ENV;
    }
    camelCased.openaiApiKey = process.env.OPENAI_API_KEY;
    camelCased.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    camelCased.groqApiKey = process.env.GROQ_API_KEY;
    camelCased.perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    camelCased.geminiApiKey = process.env.GEMINI_API_KEY;

    // Runtime computed
    camelCased.isLocal = process.env.GITHUB_ACTIONS !== "true";
    camelCased.runningOn = process.env.GITHUB_ACTIONS !== "true" ? "local" : "CI";

    applyEnvOverrides(camelCased);

    return ConfigSchema.parse(camelCased);
}
