import { formatDistanceToNowStrict } from "date-fns";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PairingPanel } from "@/components/settings/pairing-panel";

export const metadata = { title: "Chrome extension" };
export const dynamic = "force-dynamic";

export default async function ExtensionSettingsPage() {
  const user = await requireUser();
  const tokens = await prisma.extensionToken.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 text-sm">
        <h2 className="mb-2 text-xl">Autofill for Greenhouse and Lever</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Build it once: <code>npm run build:extension</code> (output in <code>apps/extension/dist</code>).</li>
          <li>Open <code>chrome://extensions</code>, turn on Developer mode, choose “Load unpacked”, and pick that <code>dist</code> folder.</li>
          <li>Click the Foothold icon, set the app URL, and enter a pairing code from below.</li>
          <li>On a Greenhouse or Lever application page, press “Fill from profile”. Review every field, then submit it yourself.</li>
        </ol>
      </div>
      <PairingPanel tokens={tokens.map((t) => ({ id: t.id, name: t.name, createdAgo: formatDistanceToNowStrict(t.createdAt, { addSuffix: true }), lastUsedAgo: t.lastUsedAt ? formatDistanceToNowStrict(t.lastUsedAt, { addSuffix: true }) : null }))} />
    </div>
  );
}
