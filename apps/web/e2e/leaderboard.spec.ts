import { expect, test } from "@playwright/test";

test("submitting a perfect quiz immediately shows Alice on the leaderboard", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("User ID").fill("alice");
  await page.getByLabel("Answer 1").fill("A");
  await page.getByLabel("Answer 2").fill("C");
  await page.getByLabel("Answer 3").fill("B");
  await page.getByLabel("Answer 4").fill("D");
  await page.getByLabel("Answer 5").fill("A");
  await page.getByRole("button", { name: "Submit quiz" }).click();

  await expect(page.getByText("1. alice")).toBeVisible();
  await expect(page.getByText("50 points")).toBeVisible();
});
