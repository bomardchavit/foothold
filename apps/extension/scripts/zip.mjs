// Store-ready zip of the built extension: apps/extension/release/foothold-extension-<version>.zip
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!existsSync("dist/manifest.json")) { console.error("[extension] run `vite build` first"); process.exit(1); }
mkdirSync("release", { recursive: true });
const out = `release/foothold-extension-${pkg.version}.zip`;
rmSync(out, { force: true });
execFileSync("zip", ["-qr", `../${out}`, "."], { cwd: "dist", stdio: "inherit" });
console.log(`[extension] ${out}`);
