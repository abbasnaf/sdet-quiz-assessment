import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabasePath } from "../src/client";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(packageRoot, "migrations");
const dbPath = getDatabasePath();

mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.run("PRAGMA foreign_keys = ON");

for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
  const sql = readFileSync(resolve(migrationsDir, file), "utf8");
  sqlite.exec(sql);
  console.log(`applied ${file}`);
}

sqlite.close();
console.log(`database ready at ${dbPath}`);
