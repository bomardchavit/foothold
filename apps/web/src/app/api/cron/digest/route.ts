import { env } from "@/lib/env";
import { dailyDigestJob } from "@/lib/digest/send";

/** Trigger the daily digest from an external scheduler: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/digest` */
export const maxDuration = 300;
async function handle(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.cronSecret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await dailyDigestJob();
  return Response.json({ sent });
}
export const POST = handle;
export const GET = handle;
