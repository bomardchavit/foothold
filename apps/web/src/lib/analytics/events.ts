/** Every product event, in one place. Activation = first `resume_exported` with kind=tailored. Retention anchor = weekly `feed_viewed`. */
export const EVENTS = {
  user_signed_up: "user_signed_up",
  onboarding_step_completed: "onboarding_step_completed",
  profile_completed: "profile_completed",
  feed_viewed: "feed_viewed",
  job_viewed: "job_viewed",
  match_breakdown_opened: "match_breakdown_opened",
  low_quality_toggled: "low_quality_toggled",
  copilot_asked: "copilot_asked",
  resume_tailored: "resume_tailored",
  tailoring_diff_accepted: "tailoring_diff_accepted",
  resume_exported: "resume_exported",
  application_status_changed: "application_status_changed",
  outreach_sent: "outreach_sent",
  contacts_imported: "contacts_imported",
  extension_paired: "extension_paired",
  extension_autofill_used: "extension_autofill_used",
  digest_sent: "digest_sent",
  digest_opened: "digest_opened",
} as const;
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
export const ACTIVATION_EVENT = EVENTS.resume_exported;
export const RETENTION_ANCHOR_EVENT = EVENTS.feed_viewed;
