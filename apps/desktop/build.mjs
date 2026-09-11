import { build, context } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));
const watch = process.argv.includes("--watch");
/** Baked into the binary so a distributed build opens the right server with no setup. */
const appUrl = process.env.FOOTHOLD_APP_URL ?? "";

const options = {
  entryPoints: { main: "src/main.ts", preload: "src/preload.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "electron-updater"],
  define: {
    "process.env.FOOTHOLD_APP_URL": JSON.stringify(appUrl),
    "process.env.FOOTHOLD_VERSION": JSON.stringify(pkg.version),
  },
  logLevel: "info",
};

await mkdir("dist/pages", { recursive: true });
await cp("src/pages", "dist/pages", { recursive: true });
await writeFile("dist/package.json", JSON.stringify({ type: "commonjs" }, null, 2));

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[desktop] watching");
} else {
  await build(options);
}
