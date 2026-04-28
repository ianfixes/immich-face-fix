import { defineConfig } from "@playwright/test";

const artifactsDir = process.env.ARTIFACTS_DIR ?? "/artifacts";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["junit", { outputFile: `${artifactsDir}/junit.xml` }]],
  use: {
    baseURL: process.env.APP_URL ?? "http://face-fix:8080",
    trace: "off",
    video: "off",
    screenshot: "off"
  },
  outputDir: `${artifactsDir}/playwright-output`
});
