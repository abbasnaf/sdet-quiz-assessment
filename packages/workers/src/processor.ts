import { LEADERBOARD_CACHE_KEY, createRedisConnection, db, playerScores, results, submissions, users } from "@quiz/db";
import { desc, eq, sql } from "drizzle-orm";
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

  // redis distributed lock
  // This prevents SQLite from being overwhelmed
  const lockKey = `lock:user:${job.userId}`;
  let acquired = false;

  //wait until this worker has access
  while (!acquired) {
    const lockResult = await redis.set(lockKey, "LOCKED", "NX", "PX", 5000);
    if (lockResult === "OK") {
      acquired = true;
    } else {
      await new Promise((r) => setTimeout(r, 100)); //retry after 100ms
    }
  }

  try {
    
    // skip the already tried bullmq work
    const [existingSub] = await db
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, job.submissionId))
      .limit(1);

    if (existingSub?.status === "evaluated") {
      return { score, correctCount, status: "skipped_duplicate" };
    }

    // Ensure structural rows exist
    await db.insert(users).values({ id: job.userId, displayName: job.userId }).onConflictDoNothing();
    await db.insert(playerScores).values({ userId: job.userId, totalScore: 0 }).onConflictDoNothing();

  

    // Atomic Score Increment
    await db
      .update(playerScores)
      .set({
        totalScore: sql`${playerScores.totalScore} + ${score}`,
        updatedAt: new Date(),
      })
      .where(eq(playerScores.userId, job.userId));

    // Insert 
    await db.insert(results).values({
      id: crypto.randomUUID(),
      submissionId: job.submissionId,
      userId: job.userId,
      quizId: job.quizId,
      score,
      correctCount
    });

    // Mark as Evaluated
    await db.update(submissions).set({ status: "evaluated" }).where(eq(submissions.id, job.submissionId));

  } finally {

    // release lock
    await redis.del(lockKey);
  }

  try {
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
  } catch (err) {
    console.warn("[Worker Cache] Non-blocking leaderboard update skipped due to load.");
  }

  return { score, correctCount };
}
