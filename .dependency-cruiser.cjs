/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            comment:
                "Circular dependencies make code hard to reason about and can cause runtime issues.",
            severity: "error",
            from: {},
            to: { circular: true },
        },
        {
            name: "no-src-to-tests",
            comment: "Production code should never depend on test files.",
            severity: "error",
            from: { path: "^src/" },
            to: { path: "^tests/" },
        },
        {
            name: "no-renderer-to-main",
            comment:
                "The renderer must only talk to the main process through IPC (window.electronAPI). " +
                "Importing from src/main/ would break sandboxing and bundle Node code into the browser.",
            severity: "error",
            from: { path: "^src/renderer/" },
            to: { path: "^src/main/" },
        },
        {
            name: "no-renderer-to-preload",
            comment:
                "Renderer code must not import the preload script directly - it's delivered via contextBridge.",
            severity: "error",
            from: { path: "^src/renderer/" },
            to: { path: "^src/preload/" },
        },
        {
            name: "no-main-to-renderer",
            comment:
                "The main process must not reach into renderer code - cross the boundary via IPC.",
            severity: "error",
            from: { path: "^src/main/" },
            to: { path: "^src/renderer/" },
        },
        {
            name: "no-dev-deps-in-src",
            comment: "Production code should not use devDependencies.",
            severity: "error",
            from: { path: "^src/" },
            to: { dependencyTypes: ["npm-dev"] },
        },
        {
            name: "no-orphans",
            comment: "Modules that are not imported by anything are dead code.",
            severity: "warn",
            from: {
                orphan: true,
                pathNot: [
                    "(^|/)\\.[^/]+",
                    "\\.d\\.ts$",
                    "(^|/)tsconfig\\.json$",
                    "^src/main/index\\.ts$",
                    "^src/preload/index\\.ts$",
                    "^src/renderer/src/main\\.tsx$",
                ],
            },
            to: {},
        },
    ],
    options: {
        tsConfig: {
            fileName: "tsconfig.json",
        },
        tsPreCompilationDeps: true,
        includeOnly: ["^src/", "^tests/"],
        enhancedResolveOptions: {
            exportsFields: ["exports"],
            conditionNames: ["import", "require", "node", "default", "types"],
            mainFields: ["module", "main", "types", "typings"],
        },
    },
};
