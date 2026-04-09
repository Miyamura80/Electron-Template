Bun is the only supported package manager for this repository. All frontend,
main-process, preload, script, and documentation tooling runs through Bun.

## Workflow

- **Install deps**: `bun install` at the repo root to hydrate `bun.lock` and
  keep `node_modules` aligned.
- **Run scripts**: Always use `bun run <script>` (or `bunx` when a tool isn't
  installed globally) instead of `npm run` / `yarn` / `pnpm`.
- **Docs workspace**: The `docs/` site ships with its own `bun.lock`. Run
  `cd docs && bun install` whenever you sync the workspace.
- **Add deps**:
    - Runtime: `bun add <pkg>`
    - Dev: `bun add -d <pkg>`
- **Lockfile hygiene**: Treat `bun.lock` (and `docs/bun.lock`) as the single
  source of truth - never edit it manually; use `bun install` to update it.

## Troubleshooting

- If you see `bun: command not found`, install Bun from https://bun.sh and
  re-run `bun install`.
- To get the current Bun version, run `bun --version` so reviewers know what
  runtime you tested with.

## Do Not

- Do not install dependencies with `npm`, `yarn`, or `pnpm`.
- Do not reintroduce `uv`, `pip`, or any Python dependency managers. This is
  an Electron + TypeScript project; all tooling runs through Bun.
