import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startRedisContainer, type StartedRedis } from "../testcontainers";

type ChildProcess = ReturnType<typeof Bun.spawn>;

const repoRoot = resolve(import.meta.dir, "../../../..");
const apiUrl = "http://127.0.0.1:3901";
const databasePath = resolve(tmpdir(), `quiz-concurrency-${Date.now()}.sqlite`);

let redis: StartedRedis | undefined;
let apiProcess: ChildProcess | undefined;
let workerProcess: ChildProcess | undefined;

async function waitForHealth() {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      await Bun.sleep(250);
    }
  }

  throw new Error("API did not become healthy before the test timeout");
}

beforeAll(async () => {
  redis = await startRedisContainer();
  mkdirSync(tmpdir(), { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: databasePath,
    REDIS_URL: redis.url,
    PORT: "3901"
  };

  const migration = Bun.spawn({
    cmd: ["bun", "run", "packages/db/scripts/migrate.ts"],
    cwd: repoRoot,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });
  const migrationExit = await migration.exited;
  if (migrationExit !== 0) {
    throw new Error(`database migration failed with exit code ${migrationExit}`);
  }

  apiProcess = Bun.spawn({
    cmd: ["bun", "run", "apps/api/src/index.ts"],
    cwd: repoRoot,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });

  workerProcess = Bun.spawn({
    cmd: ["bun", "run", "packages/workers/src/index.ts"],
    cwd: repoRoot,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });

  await waitForHealth();
});

afterAll(async () => {
  apiProcess?.kill();
  workerProcess?.kill();
  await redis?.stop();
});

test("five concurrent quiz submissions for one user all contribute to the final leaderboard score", async () => {
  const body = {
    userId: "race-user",
    quizId: "quiz-1",
    answers: ["A", "C", "B", "D", "A"]
  };

  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      fetch(`${apiUrl}/api/quiz/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    )
  );

  for (const response of responses) {
    expect(response.status).toBe(202);
  }

  await Bun.sleep(3_000);

  const leaderboardResponse = await fetch(`${apiUrl}/api/leaderboard`);
  const leaderboard = (await leaderboardResponse.json()) as {
    players: Array<{ userId: string; totalScore: number }>;
  };
  const player = leaderboard.players.find((entry) => entry.userId === "race-user");

  expect(player?.totalScore).toBe(250);
});
