import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://trnfit:trnfit@localhost:5432/trnfit_e2e";
const fake = (file: string) => [
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`,
];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "ar-SA", timezoneId: "Asia/Riyadh" },
  webServer: {
    command: `DATABASE_URL=${E2E_DB} npx tsx scripts/reset-db.ts && DATABASE_URL=${E2E_DB} npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", testMatch: /(auth|inventory|labels)\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth.json" } },
    { name: "fixtures", testMatch: /fixtures\.setup\.ts/, dependencies: ["desktop"], use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth.json" } },
    {
      name: "scanner-mobile", testMatch: /scanner\.spec\.ts/, dependencies: ["fixtures"],
      use: { ...devices["Pixel 7"], storageState: "tests/e2e/.auth.json", launchOptions: { args: fake("tests/e2e/fixtures/static-blk.y4m") } },
    },
    {
      name: "scanner-rapid", testMatch: /scanner-rapid\.spec\.ts/, dependencies: ["scanner-mobile"],
      use: { ...devices["Pixel 7"], storageState: "tests/e2e/.auth.json", launchOptions: { args: fake("tests/e2e/fixtures/sequence.y4m") } },
    },
    { name: "responsive", testMatch: /responsive\.spec\.ts/, dependencies: ["scanner-rapid"], use: { storageState: "tests/e2e/.auth.json" } },
  ],
});