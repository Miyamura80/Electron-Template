import { type Dirent, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
    ".git",
    ".cache",
    ".next",
    "node_modules",
    "out",
    "release",
    "dist",
    "build",
    "coverage",
    "docs",
    "manual_docs",
    "media",
    "Tauri-Template",
]);

const EXTENSIONS = new Set([".ts", ".tsx"]);

interface Config {
    max_lines: number;
    exclude: string[];
}

function loadConfig(): Config {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
    const cfg = pkg.fileLength ?? {};
    return {
        max_lines: cfg.max_lines ?? 500,
        exclude: cfg.exclude ?? [],
    };
}

function walk(dir: string): string[] {
    const results: string[] = [];
    let entries: Dirent[];
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        // Directory is unreadable (EACCES) or was deleted mid-walk (ENOENT).
        // Skip silently: a missing generated dir shouldn't crash the check.
        return results;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                results.push(...walk(join(dir, entry.name)));
            }
        } else if (EXTENSIONS.has(extname(entry.name))) {
            results.push(join(dir, entry.name));
        }
    }
    return results;
}

function isExcluded(rel: string, patterns: string[]): boolean {
    // Match exact file path OR any directory prefix (e.g. "src/generated"
    // excludes "src/generated/foo.ts"). No full glob support by design:
    // prefix matching covers the common "exclude a whole subtree" case.
    return patterns.some((pattern) => rel === pattern || rel.startsWith(`${pattern}/`));
}

function main(): number {
    const config = loadConfig();
    const violations: [string, number][] = [];

    for (const file of walk(REPO_ROOT)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
        if (isExcluded(rel, config.exclude)) continue;

        const content = readFileSync(file, "utf-8");
        const lineCount = content.trimEnd().split("\n").length;
        if (lineCount > config.max_lines) {
            violations.push([rel, lineCount]);
        }
    }

    if (violations.length > 0) {
        violations.sort((a, b) => a[0].localeCompare(b[0]));
        console.error(
            `File length check failed: ${violations.length} file(s) exceed ${config.max_lines} lines`,
        );
        for (const [path, count] of violations) {
            console.error(`  ${path}: ${count} lines`);
        }
        console.error(
            'Refactor large files into smaller modules, or add to "fileLength.exclude" in package.json.',
        );
        return 1;
    }

    console.log(`File length check passed (all files <= ${config.max_lines} lines).`);
    return 0;
}

process.exit(main());
