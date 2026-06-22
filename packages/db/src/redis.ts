import Redis, { type RedisOptions } from "ioredis";

export const LEADERBOARD_CACHE_KEY = "leaderboard:top10";

export function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

export function createRedisConnection(options: RedisOptions = {}) {
  return new Redis(getRedisUrl(), {
    lazyConnect: false,
    ...options
  });
}

export function createBullMqRedisConnection() {
  const url = new URL(getRedisUrl());
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    maxRetriesPerRequest: null
  };
}
