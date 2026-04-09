# ANSI color codes
GREEN=\033[0;32m
YELLOW=\033[0;33m
RED=\033[0;31m
BLUE=\033[0;34m
RESET=\033[0m

PROJECT_ROOT=.

.DEFAULT_GOAL := help

########################################################
# Help
########################################################

### Help
.PHONY: help docs
help: ## Show this help message
	@echo "$(BLUE)Available Make Targets$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "; category=""} \
		/^### / {category = substr($$0, 5); next} \
		/^[a-zA-Z_-]+:.*?## / { \
			if (category != last_category) { \
				if (last_category != "") print ""; \
				print "$(GREEN)" category ":$(RESET)"; \
				last_category = category; \
			} \
			printf "  $(YELLOW)%-23s$(RESET) %s\n", $$1, $$2 \
		}' $(MAKEFILE_LIST)

########################################################
# Onboarding & Setup
########################################################

### Onboarding & Setup
.PHONY: onboard
onboard: check_bun ## Interactive onboarding CLI (rename, deps, env, hooks, media)
	@bun run onboard.ts

########################################################
# Asset Generation
########################################################

### Asset Generation
.PHONY: banner logo
banner: check_bun ## Generate project banner image
	@echo "$(YELLOW)🎨 Generating banner...$(RESET)"
	@bun run scripts/generate-banner.ts
	@echo "$(GREEN)✅ Banner generated at media/banner.png$(RESET)"

logo: check_bun ## Generate logo, icons, and favicon
	@echo "$(YELLOW)🎨 Generating logo suite...$(RESET)"
	@bun run scripts/generate-logo.ts
	@echo "$(GREEN)✅ Logo suite generated in docs/public/$(RESET)"

########################################################
# Check dependencies
########################################################

check_bun:
	@if ! command -v bun > /dev/null 2>&1; then \
		echo "$(RED)bun is not installed. Please install bun before proceeding.$(RESET)"; \
		exit 1; \
	else \
		bun --version; \
	fi

check_jq:
	@echo "$(YELLOW)🔍Checking jq version...$(RESET)"
	@if ! command -v jq > /dev/null 2>&1; then \
		echo "$(RED)jq is not installed. Please install jq before proceeding.$(RESET)"; \
		echo "$(RED)brew install jq$(RESET)"; \
		exit 1; \
	else \
		jq --version; \
	fi

########################################################
# Setup
########################################################

### Setup & Dependencies
setup: check_bun ## Install dependencies
	@echo "$(YELLOW)🔄 Installing dependencies...$(RESET)"
	@bun install
	@echo "$(GREEN)✅ Dependencies installed.$(RESET)"

setup_githooks: ## Set up git hooks with prek
	@echo "$(YELLOW)🔨 Setting up githooks with prek...$(RESET)"
	@git config --unset-all core.hooksPath || true
	@bun install -g @j178/prek
	@prek install

view_deps_size: check_bun ## Show total node_modules size
	@echo "$(YELLOW)🔍Checking node_modules size...$(RESET)"
	@du -sh node_modules
	@echo "$(GREEN)Done.$(RESET)"

view_deps_size_by_package: check_bun ## Show node_modules size by package
	@echo "$(YELLOW)🔍Checking node_modules size by package...$(RESET)"
	@du -sh node_modules/*/ | sort -h
	@echo "$(GREEN)Done.$(RESET)"

########################################################
# Run
########################################################

### Running
all: check_bun ## Install deps and run the desktop app
	@bun install
	@echo "$(GREEN)🏁 Launching Electron app...$(RESET)"
	@bun run dev

dev: check_bun ## Run Electron in dev mode (hot reload)
	@echo "$(GREEN)⚡ Starting electron-vite dev server...$(RESET)"
	@bun run dev

build: check_bun ## Build main, preload, and renderer bundles
	@echo "$(YELLOW)🔨 Building Electron bundles...$(RESET)"
	@bun run build
	@echo "$(GREEN)✅ Build completed (output in out/).$(RESET)"

package: check_bun ## Build and package the app for the current platform
	@echo "$(YELLOW)📦 Packaging Electron app...$(RESET)"
	@bun run package
	@echo "$(GREEN)✅ Packaging completed (output in release/).$(RESET)"

docs: ## Run docs with bun
	@echo "$(GREEN)📚Running docs...$(RESET)"
	@cd docs && bun run dev
	@echo "$(GREEN)✅ Docs run completed.$(RESET)"

ralph: check_jq ## Run Ralph agent loop
	@echo "$(RED)⚠️  WARNING: Ralph is an autonomous agent that can modify your codebase.$(RESET)"
	@echo "$(RED)⚠️  It is HIGHLY RECOMMENDED to run Ralph in a sandboxed environment.$(RESET)"
	@printf "$(YELLOW)Are you sure you want to continue? [y/N] $(RESET)" && read ans && [ "$$ans" = "y" ] || (echo "$(RED)Aborted.$(RESET)"; exit 1)
	@echo "$(GREEN)🤖 Starting Ralph Agent...$(RESET)"
	@chmod +x scripts/ralph.sh
	@./scripts/ralph.sh $(ARGS)
	@echo "$(GREEN)✅ Ralph Agent finished.$(RESET)"

########################################################
# Testing
########################################################

### Testing
test: check_bun ## Run all tests
	@echo "$(GREEN)🧪 Running tests...$(RESET)"
	@bun test
	@echo "$(GREEN)✅ Tests passed.$(RESET)"

test_fast: check_bun ## Run fast tests (5s timeout)
	@echo "$(GREEN)🧪 Running fast tests...$(RESET)"
	@bun test --timeout 5000
	@echo "$(GREEN)✅ Fast tests passed.$(RESET)"

test_watch: check_bun ## Run tests in watch mode
	@bun test --watch

########################################################
# Code Quality
########################################################

### Code Quality
fmt: check_bun ## Format code with Biome
	@echo "$(YELLOW)✨ Formatting with Biome...$(RESET)"
	@bunx biome check --write
	@echo "$(GREEN)✅ Formatting completed.$(RESET)"

lint: check_bun ## Run Biome linter
	@echo "$(YELLOW)🔍 Running Biome linter...$(RESET)"
	@bunx biome check
	@echo "$(GREEN)✅ Linting completed.$(RESET)"

tech_debt: check_bun ## Check TODO/FIXME markers in TypeScript/JavaScript
	@echo "$(YELLOW)🔍Checking tech debt markers...$(RESET)"
	@! git grep -nEI "(TODO|FIXME|HACK|XXX)" -- '*.ts' '*.tsx' '*.js' '*.jsx' || (echo "$(RED)Tech debt markers found. Please resolve or remove them.$(RESET)" && exit 1)
	@echo "$(GREEN)✅Tech debt check completed.$(RESET)"

duplicate_code: check_bun ## Detect duplicate code blocks
	@echo "$(YELLOW)🔍Checking duplicate code...$(RESET)"
	@bunx jscpd src/ --min-lines 5 --min-tokens 50 --threshold 5
	@echo "$(GREEN)✅Duplicate code check completed.$(RESET)"

deadcode: check_bun ## Find dead code and unused deps with knip
	@echo "$(YELLOW)🔍 Running knip (dead code + unused deps)...$(RESET)"
	@bunx knip
	@echo "$(GREEN)✅ Dead code check completed.$(RESET)"

import_lint: check_bun ## Enforce module boundaries with dependency-cruiser
	@echo "$(YELLOW)🔍 Running dependency-cruiser...$(RESET)"
	@bunx depcruise src tests --config .dependency-cruiser.cjs --output-type err
	@echo "$(GREEN)✅ Module boundary check completed.$(RESET)"

typecheck: check_bun ## Run TypeScript type checker
	@echo "$(YELLOW)🔍 Running TypeScript type checker...$(RESET)"
	@bunx tsc --noEmit
	@echo "$(GREEN)✅ Type check completed.$(RESET)"

docs_lint: ## Lint docs links
	@echo "$(YELLOW)🔍Linting docs links...$(RESET)"
	@cd docs && bun run lint:links
	@echo "$(GREEN)✅Docs linting completed.$(RESET)"

lint_links: check_bun ## Check markdown links
	@echo "$(YELLOW)🔍 Linting markdown links...$(RESET)"
	@find . -name "*.md" -not -path "*/node_modules/*" -not -path "./Tauri-Template/*" -not -path "./docs/*" | xargs bunx markdown-link-check --quiet --config .markdown-link-check.json
	@echo "$(GREEN)✅ Link linting completed.$(RESET)"

agents_validate: check_bun ## Validate AGENTS.md content
	@echo "$(YELLOW)🔍Validating AGENTS.md...$(RESET)"
	@bun run scripts/validate-agents-md.ts
	@echo "$(GREEN)✅AGENTS.md validation completed.$(RESET)"

check_ai_writing: check_bun ## Check for AI-written content
	@echo "$(YELLOW)🔍 Checking AI writing patterns...$(RESET)"
	@bun run scripts/check_ai_writing.ts
	@echo "$(GREEN)✅ AI writing check completed.$(RESET)"

file_len_check: check_bun ## Check TS/TSX files don't exceed max line count
	@echo "$(YELLOW)🔍 Checking file lengths...$(RESET)"
	@bun run scripts/check_file_length.ts
	@echo "$(GREEN)✅ File length check completed.$(RESET)"

ci: lint deadcode typecheck tech_debt duplicate_code import_lint lint_links check_ai_writing file_len_check ## Run all CI checks
	@echo "$(GREEN)✅ CI checks completed.$(RESET)"
