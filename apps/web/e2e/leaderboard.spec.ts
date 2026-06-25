import { expect, test } from "@playwright/test";

test("submitting a perfect quiz immediately shows Alice on the leaderboard", async ({ page }) => {
  await page.goto("/");

  const myUser = `alice${Date.now()}`;

  await page.getByLabel("User ID").fill(myUser);
  await page.getByLabel("Answer 1").fill("A");
  await page.getByLabel("Answer 2").fill("C");
  await page.getByLabel("Answer 3").fill("B");
  await page.getByLabel("Answer 4").fill("D");
  await page.getByLabel("Answer 5").fill("A");
  await page.getByRole("button", { name: "Submit quiz" }).click();
  
//check if user is there on leaderboard
  const userLead = page
    .locator('[aria-label="Leaderboard results"] li')
    .filter({ hasText: myUser });

//  await expect(page.getByText("1. alice")).toBeVisible();
//  await expect(page.getByText("50 points")).toBeVisible();

/* this refreshes the page and could be used without fixing the polling issue
  await expect(async () => {
    await page.reload(); // Manually force the UI to fetch fresh data
    await expect(userLead).toContainText("50 points");
  }).toPass({
    intervals: [500], // Retry every 500ms
    timeout: 5000,    // Give up after 5 seconds
  });
*/

// await expect with the polling fix makes the test script work consistently and is a better approach
 await expect(userLead).toContainText("50 points", { timeout: 5000 });
});

