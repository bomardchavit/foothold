import { redirect } from "next/navigation";
export default async function FeedRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])) as [string, string][]).toString();
  redirect(`/jobs${qs ? `?${qs}` : ""}`);
}
