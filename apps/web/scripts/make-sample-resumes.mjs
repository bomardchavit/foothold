// Produces data/seed/resumes/*.pdf|docx through the running app (npm run dev) using the dev login.
import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = process.env.APP_URL ?? "http://localhost:3000";
const dir = path.resolve(process.cwd(), "../../data/seed/resumes");
for (const name of ["priya_natarajan", "marcus_bell", "elena_ortiz"]) {
  const ctx = await request.newContext({ baseURL: base });
  const { csrfToken } = await (await ctx.get("/api/auth/csrf")).json();
  await ctx.post("/api/auth/callback/dev-login", { form: { csrfToken, email: `sample-${name}@foothold.local`, callbackUrl: `${base}/feed` }, maxRedirects: 0 }).catch(() => {});
  const up = await ctx.post("/api/resume/upload", { multipart: { file: { name: `${name}.txt`, mimeType: "text/plain", buffer: readFileSync(path.join(dir, `${name}.txt`)) } } });
  if (!up.ok()) throw new Error(`upload failed ${up.status()} ${await up.text()}`);
  const { id } = await up.json();
  for (let i = 0; i < 60; i++) { const s = await (await ctx.get(`/api/resume/upload/${id}`)).json(); if (s.status === "DONE") break; if (s.status === "FAILED") throw new Error(s.error); await new Promise((r) => setTimeout(r, 1000)); }
  const { id: docId } = await (await ctx.post("/api/resume/base")).json();
  for (const fmt of ["pdf", "docx"]) {
    const res = await ctx.get(`/api/resume/${docId}/export?format=${fmt}`);
    if (!res.ok()) throw new Error(`export ${fmt} failed ${res.status()}`);
    writeFileSync(path.join(dir, `${name}.${fmt}`), await res.body());
  }
  console.log("wrote", name, "pdf + docx");
  await ctx.dispose();
}
