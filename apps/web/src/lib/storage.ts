import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

/** File storage adapter. Local disk today; swap `putFile`/`getFile` for S3/Blob in production. */
function root() { return path.resolve(process.cwd(), env.storageDir); }
function safe(key: string) {
  const p = path.resolve(root(), key);
  if (!p.startsWith(root())) throw new Error("invalid storage key");
  return p;
}
export async function putFile(key: string, data: Buffer | Uint8Array): Promise<string> {
  const p = safe(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
  return key;
}
export async function getFile(key: string): Promise<Buffer> { return fs.readFile(safe(key)); }
export async function deleteFile(key: string): Promise<void> { await fs.rm(safe(key), { force: true }); }
export async function fileExists(key: string): Promise<boolean> { try { await fs.access(safe(key)); return true; } catch { return false; } }
