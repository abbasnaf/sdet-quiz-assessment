# Task 1 – Flaky Playwright End-to-End Test

## Problem

The leaderboard E2E test was flaky because quiz evaluation is asynchronous, also because the ui was not updating automatically

When a user submits a quiz:

1. The API immediately accepts the request.
2. A BullMQ job is queued for evaluation.
3. The worker calculates the score asynchronously.
4. The leaderboard is fetched right after the POST call is done
5. 1.5 seconds of delay is there for the update to complete which makes the ui fetch old leaderboard.
 
The frontend displayed only the leaderboard data that was loaded during the initial page render. After the submission completed, the page did not automatically refresh leaderboard data, so the UI continued showing old information until the user manually refreshs the page.

Because the Playwright test checked the leaderboard immediately after submit button is pressed, it frequently failed.

## Root Cause

The issue was not only the asynchronous worker processing.

The frontend itself was not refreshing based on the backend state changes. Once the initial leaderboard was rendered, no extra requests were made to fetch the updated rankings after the worker finished processing.

This meant that even though the database and Redis cache contained the updated scores, the browser continued displaying old data.

## Solution

The frontend was modified to periodically refresh the leaderboard by polling the leaderboard endpoint.

```
  useEffect(() => {
    void loadLeaderboard();

    const interval = setInterval(() => {
      void loadLeaderboard();
    }, 2000);

  return () => clearInterval(interval);
}, []);
```

This allows the UI to automatically detect when background processing has completed and display the updated scores without requiring a manual page refresh.

Then I updated Playwright test retrying assertions against the dynamically updating UI instead of relying on fixed delays or hardcoded timeouts.
I also randomised the user so that the user is always unique and the point always stays at 50.

```
  const userLead = page
    .locator('[aria-label="Leaderboard results"] li')
    .filter({ hasText: myUser });

 await expect(userLead).toContainText("50 points", { timeout: 5000 });
});
```

This approach keeps the test deterministic while also fixing the user experience.
I had also tried with one more approach where the Playwright refreshes the page periodically. This quality of test is not production grade.

# Task 2 - Mitigate the Concurrency Race Condition

## Problem

The original worker implementation used a read-modify-write pattern to update users scores:
1. Read current score from database
```
const [current] = await db
  .select({ totalScore: playerScores.totalScore })
  .from(playerScores)
  .where(eq(playerScores.userId, job.userId))
  .limit(1);
```
2. Calculate new score
```
const nextTotalScore = (current?.totalScore ?? 0) + score;
```
3. Write back to database
```
await db
  .update(playerScores)
  .set({ totalScore: nextTotalScore, updatedAt: new Date() })
  .where(eq(playerScores.userId, job.userId));
```
## Root Cause

With worker concurrency set to 8, if multiple workers start processing submissions for the same user, they can execute the SELECT before any of them execute the UPDATE. Each worker reads the same old score, computes independently, and the last worker overwrites the value, discarding all other updates.
Example with two workers running paralelly, starting score of 50:
Worker A: SELECT totalScore - 50
Worker B: SELECT totalScore - 50
Worker A: 50 + 50 = 100 - UPDATE SET totalScore = 100
Worker B: 50 + 50 = 100 - UPDATE SET totalScore = 100
Final: 100 (correct would be 150)
Reproduction Test
A component test was authored at packages/testing/src/component/concurrency.test.ts that floods 200 concurrent submissions for the same user and asserts the final cumulative score equals the expected total (100 × 50 = 5000).
```
const CONCURRENT_SUBMISSIONS = 200;
const SCORE_PER_SUBMISSION = 50;
const EXPECTED_TOTAL_SCORE = CONCURRENT_SUBMISSIONS * SCORE_PER_SUBMISSION;
```
Assessment of reproduction: The test did not reliably fail against the old buggy code in the local environment. 
SQLite's single-writer lock serializes write operations at the database engine level, accidentally preventing concurrent overwrites even when application code doesn't protect against them. This is a SQLite-specific behavior.
Even when the test Concurrency test didnt fail, write contention was there.

## Solution

To resolve both the race condition and the database lock contention, I implemented a Redis Distributed Lock combined with an Idempotency Check.

Redis Distributed Lock: I introduced a Redis lock keyed to the userId using NX and PX parameters. Instead of manually spinning or blocking the thread, if a worker fails to lock, it immediately throws an error. This efficiently leverages BullMQ's native retry mechanism.

Idempotency Guard: To protect against BullMQ's automatic retries, the worker first checks the submissions table. If the submission status is already evaluated, the worker skips the increment entirely, preventing duplicate points.

Atomic Database Increments: As an added layer of safety, the Drizzle update query uses a native SQL template (sql... + ${score}) to guarantee atomic operations at the database engine level.

# k6 Load Test

## Problem

A k6 performance script was authored at packages/testing/scripts/leaderboard.perf.js that benchmarks both the submit endpoint and the leaderboard endpoint under sustained load.
Configuration:
•	10 virtual users running for 20 seconds
•	Thresholds: p95 latency < 200ms, error rate < 5%
Gate logic: k6 exits with a non-zero code if either threshold is breached, which causes any CI pipeline step running this script to fail and block the release.
k6 Output Snapshot
scenarios: (100.00%) 1 scenario, 10 max VUs, 50s max duration
         * default: 10 looping VUs for 20s (gracefulStop: 30s)
```
THRESHOLDS
  http_req_duration
  ✓ 'p(95)<200' p(95)=67.73ms
  http_req_failed
  ✓ 'rate<0.05' rate=0.00%
```

Turborepo Configuration Fix
The original test:perf task configuration was:
```
"test:perf": {
  "inputs": ["package.json"],
  "outputs": ["dist/perf-results.json"]
}
```
This was incorrect in two ways. First, inputs only had package.json, changing the k6 script itself would not invalidate the cache, meaning Turborepo would serve a old cached result even after the test logic changed. We cannot share the same result since the load on the system could be different.
The fixed configuration:
```
"test:perf": {
  "cache": false,
  "inputs": ["k6/**/*.js", "k6/**/*.ts", ".env*"],
  "outputs": ["dist/perf-results.json"]
}
```
Result: all thresholds passed. p95 = 137ms against a 200ms gate.

cache: false is the correct and mandatory setting for performance benchmarks.
A cached perf result is meaningless as the test can perform differently across environments, infrastructure, times of day, and load conditions. 
The inputs array is retained for documentation understanding