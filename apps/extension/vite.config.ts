import { defineConfig } from "vite";
import { crx, defineManifest } from "@crxjs/vite-plugin";

const manifest = defineManifest({
  manifest_version: 3,
  name: "Foothold Autofill",
  version: "0.1.0",
  description: "Fills Greenhouse and Lever application forms from your Foothold profile. You review and submit every application yourself.",
  action: { default_popup: "src/popup/index.html", default_title: "Foothold" },
  background: { service_worker: "src/background.ts", type: "module" },
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["https://boards.greenhouse.io/*", "https://job-boards.greenhouse.io/*", "https://*.greenhouse.io/*", "https://jobs.lever.co/*", "https://jobs.ashbyhq.com/*", "https://*.myworkdayjobs.com/*"],
  content_scripts: [{ matches: ["https://boards.greenhouse.io/*", "https://job-boards.greenhouse.io/*", "https://*.greenhouse.io/*", "https://jobs.lever.co/*", "https://jobs.ashbyhq.com/*", "https://*.myworkdayjobs.com/*"], js: ["src/content/index.ts"], run_at: "document_idle", all_frames: true }],
  icons: { 16: "public/icon16.png", 48: "public/icon48.png", 128: "public/icon128.png" },
});

export default defineConfig({ plugins: [crx({ manifest })], build: { outDir: "dist", emptyOutDir: true } });
