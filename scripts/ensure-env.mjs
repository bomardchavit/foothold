import { existsSync, copyFileSync } from "node:fs";
const dst = new URL("../apps/web/.env", import.meta.url);
const src = new URL("../apps/web/.env.example", import.meta.url);
if (!existsSync(dst)) { copyFileSync(src, dst); console.log("Created apps/web/.env from .env.example"); }
else console.log("apps/web/.env already exists");
