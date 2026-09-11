#!/usr/bin/env node
// Bump every workspace to the same version, commit and tag. Pushing the tag is what publishes a release.
//   node scripts/release.mjs 0.2.0   |   node scripts/release.mjs patch|minor|major
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PKGS = ["package.json", "apps/web/package.json", "apps/desktop/package.json", "apps/extension/package.json"];
const arg = process.argv[2];
if (!arg) { console.error("usage: node scripts/release.mjs <version|patch|minor|major>"); process.exit(1); }

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const next = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(arg) ? arg : bump(current, arg);
function bump(v, kind) {
  const [maj, min, pat] = v.split(".").map(Number);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch") return `${maj}.${min}.${pat + 1}`;
  throw new Error(`not a version or bump kind: ${kind}`);
}

const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (dirty) { console.error("Working tree is dirty. Commit or stash first:\n" + dirty); process.exit(1); }

for (const p of PKGS) {
  const json = JSON.parse(readFileSync(p, "utf8"));
  json.version = next;
  writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
}
execFileSync("git", ["add", ...PKGS], { stdio: "inherit" });
execFileSync("git", ["commit", "-m", `Release v${next}`], { stdio: "inherit" });
execFileSync("git", ["tag", "-a", `v${next}`, "-m", `v${next}`], { stdio: "inherit" });
console.log(`\nTagged v${next} (was ${current}).\nPush it to build and publish installers:\n\n  git push && git push origin v${next}\n`);
