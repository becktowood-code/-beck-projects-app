import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 60000,
  use: { headless: true, viewport: { width: 1440, height: 1000 } },
  reporter: "list",
  outputDir: "artifacts/test-results",
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
