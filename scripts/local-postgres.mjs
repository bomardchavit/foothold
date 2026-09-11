// Zero-Docker local PostgreSQL 17 with pgvector + pg_trgm.
//   npm run db:local          start (downloads binaries on first run, macOS only)
//   npm run db:local -- --stop
// Same URL as docker-compose.yml: postgresql://foothold:foothold@localhost:54329/foothold
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG = path.join(repo, ".pglocal");
const DATA = path.join(repo, ".pgdata");
const PORT = 54329;
const DMG_URL = "https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-17.dmg";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
}
const bin = (n) => path.join(PG, "bin", n);

function ensureBinaries() {
  if (existsSync(bin("pg_ctl"))) return;
  if (process.platform !== "darwin") {
    console.error("[db:local] Automatic binaries are macOS-only. Use `docker compose up -d`, or install PostgreSQL 17 + pgvector and set DATABASE_URL.");
    process.exit(1);
  }
  console.log("[db:local] downloading PostgreSQL 17 + pgvector (Postgres.app, ~115 MB)...");
  const tmp = path.join(os.tmpdir(), "foothold-pg17.dmg");
  const mnt = path.join(os.tmpdir(), "foothold-pgmnt");
  run("curl", ["-L", "-o", tmp, DMG_URL]);
  run("hdiutil", ["attach", "-nobrowse", "-quiet", "-mountpoint", mnt, tmp]);
  try {
    run("cp", ["-R", path.join(mnt, "Postgres.app/Contents/Versions/17"), PG]);
  } finally {
    run("hdiutil", ["detach", "-quiet", mnt]);
  }
}

function main() {
  if (process.argv.includes("--stop")) {
    run(bin("pg_ctl"), ["-D", DATA, "stop"]);
    return;
  }
  ensureBinaries();
  if (!existsSync(path.join(DATA, "PG_VERSION"))) {
    console.log("[db:local] initdb", DATA);
    run(bin("initdb"), ["-D", DATA, "-U", "foothold", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  }
  const status = spawnSync(bin("pg_ctl"), ["-D", DATA, "status"], { stdio: "ignore" });
  if (status.status !== 0) {
    run(bin("pg_ctl"), ["-D", DATA, "-o", `-p ${PORT} -k ${os.tmpdir()}`, "-l", path.join(DATA, "server.log"), "-w", "start"]);
  }
  const exists = spawnSync(bin("psql"), ["-h", "localhost", "-p", String(PORT), "-U", "foothold", "-d", "postgres", "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='foothold'"], { encoding: "utf8" });
  if (!exists.stdout.includes("1")) run(bin("createdb"), ["-h", "localhost", "-p", String(PORT), "-U", "foothold", "foothold"]);
  console.log(`[db:local] ready: postgresql://foothold:foothold@localhost:${PORT}/foothold`);
}
try { main(); } catch (e) { console.error(e.message); process.exit(1); }
