.PHONY: setup dev build build-extension \
        lint lint-server lint-extension test test-server test-extension \
        docker-build docker-up docker-down docker-logs docker-refresh clean

setup: ## First-time setup: uv sync, npm install, create server/.env
	./scripts/setup.sh

dev: ## Run the server locally with reload (uv)
	./scripts/dev-server.sh

build: build-extension ## Alias for build-extension

build-extension: ## Build the extension to extension/dist
	./scripts/build-extension.sh

lint: lint-server lint-extension ## Lint both server and extension

lint-server:
	cd server && uv run ruff check .

lint-extension:
	cd extension && npm run lint

test: test-server test-extension ## Run both test suites

test-server:
	cd server && uv run pytest

test-extension:
	cd extension && npm test

docker-build: ## Build the server's Docker image
	docker compose build

docker-up: ## Run the server as a container (detached)
	docker compose up -d

docker-down: ## Stop the containerized server
	docker compose down

docker-logs: ## Tail the containerized server's logs
	docker compose logs -f

docker-refresh: ## Rebuild from scratch: stop, drop volumes, rebuild, start
	docker compose down -v
	docker compose build
	docker compose up -d

clean: ## Remove build artifacts and caches
	rm -rf extension/dist extension/node_modules server/.venv \
	       server/.pytest_cache server/.ruff_cache
