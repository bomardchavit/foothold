import type { ApplicationStatus } from "@prisma/client";

/** Pipeline columns in order, with the labels shown everywhere a status is printed (never the raw enum). */
export const APPLICATION_STATUSES: Array<[ApplicationStatus, string]> = [["SAVED", "Saved"], ["APPLIED", "Applied"], ["SCREENING", "Screening"], ["INTERVIEW", "Interview"], ["OFFER", "Offer"], ["REJECTED", "Rejected"]];
export const APPLICATION_STATUS_LABELS = Object.fromEntries(APPLICATION_STATUSES) as Record<ApplicationStatus, string>;
export const statusLabel = (s: ApplicationStatus): string => APPLICATION_STATUS_LABELS[s];
