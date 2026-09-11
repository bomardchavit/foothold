"use client";
import { useEffect } from "react";
import { useCopilot, type CopilotJob } from "@/components/copilot/copilot-context";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";

export function JobPageClient({ job }: { job: CopilotJob }) {
  const c = useCopilot();
  useEffect(() => { c.setJob(job); trackClient(EVENTS.job_viewed, { jobId: job.id, company: job.company }); }, [c, job]);
  return null;
}
