import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Tests that mock fetch should not pay the crawler's politeness delay.
    env: { SCRAPER_MIN_DELAY_MS: "0", SCRAPER_API_DELAY_MS: "0", WORKDAY_POLL_PAGES: "3" },
  },
});
