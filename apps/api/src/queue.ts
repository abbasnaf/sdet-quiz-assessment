import { Queue } from "bullmq";
import { createBullMqRedisConnection } from "@quiz/db/redis";

export const QUIZ_EVALUATION_QUEUE = "quiz-evaluation";

export type QuizSubmissionJob = {
  submissionId: string;
  userId: string;
  quizId: string;
  answers: string[];
};

export function createQuizEvaluationQueue() {
  return new Queue<QuizSubmissionJob>(QUIZ_EVALUATION_QUEUE, {
    connection: createBullMqRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "fixed", delay: 500 },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  });
}
