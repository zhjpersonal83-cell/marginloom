.PHONY: install dev demo build test lint typecheck integration reproduce
install:
	corepack pnpm install --frozen-lockfile
dev:
	corepack pnpm db:migrate
	corepack pnpm dev -- --host 0.0.0.0 --port 3000
demo:
	docker compose up --build
build:
	corepack pnpm build
test:
	corepack pnpm test
	python -m unittest discover -s ml -v
lint:
	corepack pnpm lint
typecheck:
	corepack pnpm typecheck
integration: build
	corepack pnpm test:integration
reproduce:
	python ml/build.py
	python ml/segmentation/run_segmentation.py
	python scripts/export-models.py
