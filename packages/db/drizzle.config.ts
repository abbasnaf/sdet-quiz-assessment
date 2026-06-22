import { defineConfig } from "drizzle-kit";
import { getDatabasePath } from "./src/client";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath()
  }
});
