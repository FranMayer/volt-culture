import { defineConfig, devices } from "@playwright/test";

// Suite E2E de VOLT Culture — solo lectura contra Firestore, sin CI todavía
// (ver CLAUDE.md). BASE_URL apunta a un preview/prod cuando se necesita QA
// contra un deploy real; sin la env var levanta `next dev` local.
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  // ponytail: un solo browser/viewport por ahora — mobile/firefox/webkit se
  // agregan si hace falta, no de entrada con 3 specs.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180 * 1000, // next dev tarda en compilar la primera vez
      },
});
