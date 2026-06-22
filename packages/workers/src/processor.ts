import { LEADERBOARD_CACHE_KEY, createRedisConnection, db, playerScores, results, submissions, users } from "@quiz/db";
import { desc, eq } from "drizzle-orm";
import { scoreAnswers } from "./scoring";

export type QuizSubmissionJob = {
  submissionId: string;
  userId: string;
  quizId: string;
  answers: string[];
};

const redis = createRedisConnection();

export async function processQuizSubmission(job: QuizSubmissionJob) {
  await new Promise((r) => setTimeout(r, 1500));

  const { correctCount, score } = scoreAnswers(job.answers);

  await db
    .insert(users)
    .values({ id: job.userId, displayName: job.userId })
    .onConflictDoNothing();

  await db
    .insert(playerScores)
    .values({ userId: job.userId, totalScore: 0 })
    .onConflictDoNothing();

  const [current] = await db
    .select({ totalScore: playerScores.totalScore })
    .from(playerScores)
    .where(eq(playerScores.userId, job.userId))
    .limit(1);

  const nextTotalScore = (current?.totalScore ?? 0) + score;

  await db
    .update(playerScores)
    .set({ totalScore: nextTotalScore, updatedAt: new Date() })
    .where(eq(playerScores.userId, job.userId));

  await db.insert(results).values({
    id: crypto.randomUUID(),
    submissionId: job.submissionId,
    userId: job.userId,
    quizId: job.quizId,
    score,
    correctCount
  });

  await db.update(submissions).set({ status: "evaluated" }).where(eq(submissions.id, job.submissionId));

  const leaderboard = await db
    .select({
      userId: playerScores.userId,
      displayName: users.displayName,
      totalScore: playerScores.totalScore
    })
    .from(playerScores)
    .innerJoin(users, eq(users.id, playerScores.userId))
    .orderBy(desc(playerScores.totalScore))
    .limit(10);

  await redis.set(LEADERBOARD_CACHE_KEY, JSON.stringify(leaderboard), "EX", 30);

  return { score, correctCount, totalScore: nextTotalScore };
}
