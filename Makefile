# sajni-web — React + Vite frontend (deployed to Vercel).

.PHONY: help dev build preview fmt lint check clean

help:
	@echo "sajni-web targets:"
	@echo "  dev        run Vite dev server (:5173)"
	@echo "  build      tsc + vite build -> ./dist"
	@echo "  preview    serve the built bundle"
	@echo "  fmt        eslint --fix"
	@echo "  lint       eslint (read-only)"
	@echo "  check      what CI runs: lint + tsc + build"
	@echo "  clean      remove ./dist + .vite caches"

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

fmt:
	npx eslint . --fix

lint:
	npx eslint .

check: lint
	npx tsc --noEmit -p tsconfig.app.json
	npm run build

clean:
	rm -rf dist .vite *.tsbuildinfo
