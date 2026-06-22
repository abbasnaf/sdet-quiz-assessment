import cors from "@elysiajs/cors";
import { LEADERBOARD_CACHE_KEY, createRedisConnection, db, playerScores, submissions, users } from "@quiz/db";
import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { createQuizEvaluationQueue } from "./queue";

const queue = createQuizEvaluationQueue();
const redis = createRedisConnection();

const submitBody = t.Object({
  userId: t.String({ minLength: 1 }),
  quizId: t.String({ minLength: 1 }),
  answers: t.Array(t.String(), { minItems: 1 })
});

async function getLeaderboardFromDb() {
  return db
    .select({
      userId: playerScores.userId,
      displayName: users.displayName,
      totalScore: playerScores.totalScore
    })
    .from(playerScores)
    .innerJoin(users, eq(users.id, playerScores.userId))
    .orderBy(desc(playerScores.totalScore))
    .limit(10);
}

export const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST", "OPTIONS"]
    })
  )
  .get("/health", () => ({ status: "ok" }))
  .post(
    "/api/quiz/submit",
    async ({ body, set }) => {
      const submissionId = crypto.randomUUID();

      await db
        .insert(users)
        .values({ id: body.userId, displayName: body.userId })
        .onConflictDoNothing();

      await db.insert(submissions).values({
        id: submissionId,
        userId: body.userId,
        quizId: body.quizId,
        answersJson: JSON.stringify(body.answers),
        status: "queued"
      });

      await queue.add("evaluate-submission", {
        submissionId,
        userId: body.userId,
        quizId: body.quizId,
        answers: body.answers
      });

      set.status = 202;
      return { accepted: true, submissionId };
    },
    { body: submitBody }
  )
  .get("/api/leaderboard", async () => {
    const cached = await redis.get(LEADERBOARD_CACHE_KEY);

    if (cached) {
      return { source: "cache", players: JSON.parse(cached) as Awaited<ReturnType<typeof getLeaderboardFromDb>> };
    }

    const players = await getLeaderboardFromDb();
    return { source: "database", players };
  });

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port);
  console.log(`quiz api listening on http://localhost:${port}`);
}
