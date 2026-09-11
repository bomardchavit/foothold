import type { AutofillProfile } from "@foothold/shared";
export type DetectedField = { key: string; label: string; kind: "text" | "select" | "checkbox" | "radio" | "file" | "textarea"; current: string; fillable: boolean };
export type ScanResult = { ats: string | null; url: string; title: string; company: string | null; fields: DetectedField[] };
export type FillResult = { filled: Array<{ key: string; label: string; value: string }>; skipped: Array<{ key: string; label: string; reason: string }> };
export type ToContent = { type: "scan" } | { type: "fill"; profile: AutofillProfile; resumeBytes: number[] | null };
export type ToBackground = { type: "getProfile"; jobId?: string } | { type: "pair"; code: string; apiBase: string } | { type: "track"; url: string; title: string; company: string | null; ats: string | null; filled: number; resumeDocumentId: string | null } | { type: "fetchResume"; url: string };
