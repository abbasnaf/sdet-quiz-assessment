import { afterAll, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startRedisContainer, type StartedRedis } from "../testcontainers";

type ChildProcess = ReturnType<typeof Bun.spawn>;

const repoRoot = resolve(import.meta.dir, "../../../..");
const apiUrl = "http://127.0.0.1:3901";
const databasePath = resolve(tmpdir(), `quiz-concurrency-${Date.now()}.sqlite`);
const CONCURRENT_SUBMISSIONS = 100;
const SCORE_PER_SUBMISSION = 50;
const EXPECTED_TOTAL_SCORE = CONCURRENT_SUBMISSIONS * SCORE_PER_SUBMISSION;
const USER_ID = "race-user";
const QUIZ_ID = "quiz-1";
const CORRECT_ANSWERS = ["A", "C", "B", "D", "A"];

let redis: StartedRedis | undefined;
let apiProcess: ChildProcess | undefined;
let workerProcess: ChildProcess | undefined;

function openTestDatabase() {
  return new Database(databasePath);
}

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

async function waitForEvaluatedSubmissions(expectedCount: number) {
  const db = openTestDatabase();
  const deadline = Date.now() + 30_000;

  try {
    while (Date.now() < deadline) {
      const row = db
        .query(
          "SELECT COUNT(*) AS count FROM submissions WHERE user_id = ? AND status = 'evaluated'"
        )
        .get(USER_ID) as { count: number };

      if (row.count >= expectedCount) {
        return;
      }

      await Bun.sleep(100);
    }

    const pending = db
      .query(
        "SELECT COUNT(*) AS count FROM submissions WHERE user_id = ? AND status != 'evaluated'"
      )
      .get(USER_ID) as { count: number };

    throw new Error(
      `Timed out waiting for ${expectedCount} evaluated submissions (${pending.count} still pending)`
    );
  } finally {
    db.close();
  }
}

async function floodSubmitEndpoint() {
  const body = {
    userId: USER_ID,
    quizId: QUIZ_ID,
    answers: CORRECT_ANSWERS
  };

  return Promise.all(
    Array.from({ length: CONCURRENT_SUBMISSIONS }, () =>
      fetch(`${apiUrl}/api/quiz/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    )
  );
}

function readScoreIntegrity() {
  const db = openTestDatabase();

  try {
    const player = db
      .query("SELECT total_score AS totalScore FROM player_scores WHERE user_id = ?")
      .get(USER_ID) as { totalScore: number } | null;

    const results = db
      .query("SELECT score FROM results WHERE user_id = ?")
      .all(USER_ID) as Array<{ score: number }>;

    const resultCount = results.length;
    const summedResultScores = results.reduce((sum, row) => sum + row.score, 0);

    return {
      totalScore: player?.totalScore ?? 0,
      resultCount,
      summedResultScores
    };
  } finally {
    db.close();
  }
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

test(
  "flooding concurrent quiz submissions for one user preserves the cumulative leaderboard score",
  async () => {
    const responses = await floodSubmitEndpoint();

    for (const response of responses) {
      expect(response.status).toBe(202);
    }

    await waitForEvaluatedSubmissions(CONCURRENT_SUBMISSIONS);

    const { totalScore, resultCount, summedResultScores } = readScoreIntegrity();

    expect(resultCount).toBe(CONCURRENT_SUBMISSIONS);
    expect(summedResultScores).toBe(EXPECTED_TOTAL_SCORE);
    expect(totalScore).toBe(EXPECTED_TOTAL_SCORE);

    const leaderboardResponse = await fetch(`${apiUrl}/api/leaderboard`);
    const leaderboard = (await leaderboardResponse.json()) as {
      players: Array<{ userId: string; totalScore: number }>;
    };
    const player = leaderboard.players.find((entry) => entry.userId === USER_ID);

    expect(player?.totalScore).toBe(EXPECTED_TOTAL_SCORE);
  },
  { timeout: 60_000 }
);
