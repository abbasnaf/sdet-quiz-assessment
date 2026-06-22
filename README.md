# Asynchronous Quiz Evaluation & Leaderboard System

Local Turborepo monorepo for an SDET take-home assignment. It uses Bun workspaces, Next.js App Router, an Elysia API, BullMQ workers, Redis, SQLite, Drizzle ORM, Playwright, k6, and Bun tests.

## Prerequisites

- Bun 1.2+
- Redis running locally
- Docker if you want to use the included Testcontainers helper
- k6 for performance tests

Start Redis locally with Docker:

```bash
docker run --rm -p 6379:6379 redis:7-alpine
```

## Setup

```bash
bun install
bunx playwright install
bun run db:migrate
```

The SQLite database defaults to `packages/db/data/quiz.sqlite`. Override it with `DATABASE_URL=file:/absolute/path/to/quiz.sqlite` or `DATABASE_URL=/absolute/path/to/quiz.sqlite`.

## Development

Run all package dev scripts through Turborepo:

```bash
bun run dev
```

Useful package-level commands:

```bash
bun --cwd apps/api run dev
bun --cwd packages/workers run dev
bun --cwd apps/web run dev
```

Default local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Redis: `redis://127.0.0.1:6379`

## Tests

```bash
bun run typecheck
bun run test
bun run test:e2e
bun run test:perf
```

The k6 script writes its summary to `packages/testing/dist/perf-results.json`.

## Intentional Assessment Traps

This repository intentionally preserves three defects for SDET assessment purposes:

1. `apps/web/e2e/leaderboard.spec.ts` submits a quiz and immediately asserts static leaderboard text without resilient polling. The worker waits 1500ms, so this Playwright test is intentionally flaky or failing in automated contexts.
2. `packages/workers/src/processor.ts` intentionally has a lost-update race. It reads a player's current total, adds the new score, and writes the value back with no transaction, lock, atomic increment, or `SELECT FOR UPDATE` equivalent. Worker concurrency is set to 8.
3. `turbo.json` intentionally misconfigures `test:perf` caching. It caches `packages/testing/dist/perf-results.json` via the package-relative `dist/perf-results.json` output but only includes `package.json` as an input, so changes to the k6 scripts do not invalidate the cache.

## API

Submit a quiz:

```bash
curl -X POST http://localhost:3001/api/quiz/submit \
  -H 'content-type: application/json' \
  -d '{"userId":"alice","quizId":"quiz-1","answers":["A","C","B","D","A"]}'
```

Get leaderboard:

```bash
curl http://localhost:3001/api/leaderboard
```

Health check:

```bash
curl http://localhost:3001/health
```
