import Link from "next/link";
import { requireUser } from "@/lib/session";
import { findInsiders } from "@/lib/network/insiders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function InsidersPanel({ companyId, companyName, jobId }: { companyId: string; companyName: string; jobId: string }) {
  const user = await requireUser();
  const insiders = await findInsiders(user.id, companyId);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">People you know at {companyName}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {insiders.length === 0 ? (
          <p className="text-muted-foreground">No connections found. <Link className="underline" href="/network">Import your LinkedIn connections CSV</Link> or add contacts by hand.</p>
        ) : insiders.slice(0, 5).map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2" data-testid="insider">
            <div>
              <p className="font-medium">{c.firstName} {c.lastName}</p>
              <p className="text-xs text-muted-foreground">{c.title ?? ""}{c.title && c.currentCompany ? " · " : ""}{c.currentCompany ?? ""}</p>
              <div className="mt-1 flex flex-wrap gap-1">{c.reasons.map((r) => <Badge key={r} variant="secondary" className="font-normal">{r}</Badge>)}</div>
            </div>
            <Link className="shrink-0 text-xs underline" href={`/network?contact=${c.id}&jobId=${jobId}`}>Draft outreach</Link>
          </div>
        ))}
        {insiders.length > 5 && <Link className="text-xs underline" href={`/network?company=${encodeURIComponent(companyName)}`}>See all {insiders.length}</Link>}
      </CardContent>
    </Card>
  );
}
