.PHONY: help install dev build test typecheck check clean start compose-up compose-down compose-logs compose-build

help:
	@printf '%s\n' 'Available targets:'
	@printf '%s\n' '  make install       Install pnpm dependencies'
	@printf '%s\n' '  make dev           Run the local development server'
	@printf '%s\n' '  make build         Compile TypeScript'
	@printf '%s\n' '  make test          Run unit tests'
	@printf '%s\n' '  make typecheck     Run TypeScript without emitting files'
	@printf '%s\n' '  make check         Run build and tests'
	@printf '%s\n' '  make clean         Remove build output'
	@printf '%s\n' '  make start         Run the compiled app'
	@printf '%s\n' '  make compose-up    Build and run with Docker Compose'
	@printf '%s\n' '  make compose-down  Stop Docker Compose services'
	@printf '%s\n' '  make compose-logs  Follow Docker Compose logs'
	@printf '%s\n' '  make compose-build Build the Docker Compose image'

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

typecheck:
	pnpm typecheck

check: build test

clean:
	pnpm clean

start:
	pnpm start

compose-up:
	docker compose up --build

compose-down:
	docker compose down

compose-logs:
	docker compose logs -f

compose-build:
	docker compose build
