import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().defaultNow()
});

export const playerScores = sqliteTable("player_scores", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  totalScore: integer("total_score").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().defaultNow()
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  quizId: text("quiz_id").notNull(),
  answersJson: text("answers_json").notNull(),
  status: text("status", { enum: ["queued", "evaluated"] }).notNull().default("queued"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().defaultNow()
});

export const results = sqliteTable("results", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  quizId: text("quiz_id").notNull(),
  score: integer("score").notNull(),
  correctCount: integer("correct_count").notNull(),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type PlayerScore = typeof playerScores.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Result = typeof results.$inferSelect;
