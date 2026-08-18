/**
 * Project lifecycle, derived rather than stored (ADR-0009).
 *
 * A Category needs an `archived` flag because it has no end; a Project has a
 * mandatory `endDate`, so "ended" is a fact about today rather than a field
 * someone has to remember to set. Keeping it derived is also what stops a
 * Project that was left auto-assigning from quietly stamping next year's
 * spending.
 *
 * Pure and free of Firestore, so the boundary days are assertable directly.
 */
import { toDateInputValue } from "./date";
import type { Project } from "../domain/types";

export type ProjectState = "active" | "ended";

/**
 * Whether a Project is still running on `today`.
 *
 * Compared by calendar day, not by instant: `endDate` is stored at local
 * midnight, so an instant comparison would call a Project ended for the whole
 * of its own last day.
 */
export function projectState(project: Pick<Project, "endDate">, today: Date): ProjectState {
  return toDateInputValue(today) <= toDateInputValue(project.endDate) ? "active" : "ended";
}

/** Convenience for the common test. */
export function isActive(project: Pick<Project, "endDate">, today: Date): boolean {
  return projectState(project, today) === "active";
}

/** Whether `date` falls inside the Project's own range, by calendar day. */
export function coversDate(project: Pick<Project, "startDate" | "endDate">, date: Date): boolean {
  const d = toDateInputValue(date);
  return toDateInputValue(project.startDate) <= d && d <= toDateInputValue(project.endDate);
}

/**
 * The Projects worth offering when recording or editing one Financial Event.
 *
 * Showing every Project ever run would grow the picker without bound and put a
 * two-year-old trip beside the one in progress. Filtering to only what is
 * running today would be worse: it would make it impossible to file a receipt
 * you forgot during a trip that has since ended. So a Project is offered when
 * any of three things is true:
 *
 *  - the event already points at it — editing must never silently drop it;
 *  - it is running today — the ordinary case, recording during a trip;
 *  - the event's own date falls inside it — recording late, or early, for a
 *    Project whose dates say it belongs there.
 */
export function selectableProjects(
  projects: readonly Project[],
  eventDate: Date,
  today: Date,
  attachedId: string | null,
): Project[] {
  return projects.filter(
    (p) => p.id === attachedId || isActive(p, today) || coversDate(p, eventDate),
  );
}
