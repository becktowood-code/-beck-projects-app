import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 60000,
  use: { headless: true, viewport: { width: 1440, height: 1000 } },
  reporter: "list",
  outputDir: "artifacts/test-results",
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://127.0.0.1:5174",
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_SUPABASE_ANON_KEY: "" },
    reuseExistingServer: !process.env.CI,
  },
});
