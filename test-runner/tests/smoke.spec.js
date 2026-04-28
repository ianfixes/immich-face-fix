import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Set to true to save per-run screenshots with unique filenames
const SAVE_PER_RUN_SCREENSHOTS = false;


test("captures current UI baseline screenshot", async ({ page, baseURL }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByText("Immich Face Fix", { exact: true })).toBeVisible();

  const artifactsDir = process.env.ARTIFACTS_DIR ?? "/artifacts";
  await fs.mkdir(artifactsDir, { recursive: true });
  const runId = new Date().toISOString().replaceAll(":", "-");
  const latestScreenshotPath = path.join(artifactsDir, "phase0-smoke-latest.png");

  await page.screenshot({ path: latestScreenshotPath, fullPage: true });
  if (SAVE_PER_RUN_SCREENSHOTS) {
    const screenshotPath = path.join(artifactsDir, `phase0-smoke-${runId}.png`);
    await fs.copyFile(latestScreenshotPath, screenshotPath);
  }
  await test.info().attach("phase0-smoke", {
    path: latestScreenshotPath,
    contentType: "image/png"
  });

  await test.info().attach("phase0-app-url", {
    body: Buffer.from(baseURL ?? "", "utf-8"),
    contentType: "text/plain"
  });
});
