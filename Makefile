# PageOS developer tasks. Tools (goose, sqlc) run via `go run` so no global
# install is required — versions are pinned in go.mod.

GOOSE := go run github.com/pressly/goose/v3/cmd/goose@v3.22.1
SQLC  := go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0

DB_URL ?= postgres://pageos:pageos@localhost:5432/pageos?sslmode=disable

.PHONY: help
help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: tidy
tidy: ## Resolve Go dependencies
	go mod tidy

.PHONY: build
build: ## Build the api binary
	go build -o bin/api ./cmd/api

.PHONY: run
run: ## Run the api locally (needs Postgres; see docker-compose)
	PAGEOS_DATABASE_URL=$(DB_URL) go run ./cmd/api

.PHONY: test
test: ## Run tests
	go test ./...

.PHONY: migrate-up
migrate-up: ## Apply DB migrations
	$(GOOSE) -dir db/migrations postgres "$(DB_URL)" up

.PHONY: migrate-down
migrate-down: ## Roll back the last migration
	$(GOOSE) -dir db/migrations postgres "$(DB_URL)" down

.PHONY: migrate-status
migrate-status: ## Show migration status
	$(GOOSE) -dir db/migrations postgres "$(DB_URL)" status

.PHONY: sqlc
sqlc: ## Generate type-safe Go from SQL
	$(SQLC) generate

.PHONY: up
up: ## Start the local stack (postgres, minio, api, web)
	docker compose up -d --build

.PHONY: down
down: ## Stop the local stack
	docker compose down
