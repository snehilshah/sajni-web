# sajni-web — React + Vite frontend (deployed to Vercel).

.PHONY: help dev build preview fmt lint check clean

help:
	@echo "sajni-web targets:"
	@echo "  dev        run Vite dev server (:5173)"
	@echo "  build      tsc + vite build -> ./dist"
	@echo "  preview    serve the built bundle"
	@echo "  fmt        oxfmt (rewrites files)"
	@echo "  lint       oxlint (read-only)"
	@echo "  check      what CI runs: lint + format check + tsc + build"
	@echo "  clean      remove ./dist + .vite caches"

dev:
	pnpm run dev

build:
	pnpm run build

preview: build
	pnpm run preview

fmt:
	pnpm run fmt

lint:
	pnpm run lint

check: lint
	pnpm run fmt:check
	pnpm exec tsc --noEmit -p tsconfig.app.json
	pnpm run build

clean:
	rm -rf dist .vite *.tsbuildinfo
