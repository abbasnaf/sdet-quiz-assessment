import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function getDatabasePath() {
  const configured = process.env.DATABASE_URL;

  if (configured?.startsWith("file:")) {
    return configured.slice("file:".length);
  }

  if (configured && configured !== "") {
    return configured;
  }

  return resolve(packageRoot, "data", "quiz.sqlite");
}

export function createDatabase() {
  const path = getDatabasePath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.run("PRAGMA foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

export const db = createDatabase();

export type QuizDb = ReturnType<typeof createDatabase>;
