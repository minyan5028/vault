/**
 * Project lifecycle, derived rather than stored (ADR-0009).
 *
 * A Category needs an `archived` flag because it has no end; a Project has a
 * mandatory `endDate`, so its state is a fact about a date rather than a field
 * someone has to remember to set. Keeping it derived is also what stops a
 * Project that was left auto-assigning from quietly stamping next year's
 * spending.
 *
 * Pure and free of Firestore, so the boundary days are assertable directly.
 */
import { toDateInputValue } from "./date";
import type { Project } from "../domain/types";

/**
 * `upcoming` matters as much as `ended`. A Project declared weeks ahead has not
 * started, so it must not stamp and must not be presented as though it could —
 * turning auto-assign on for it would switch the genuinely running Project off
 * and leave nothing stamping at all.
 */
export type ProjectState = "upcoming" | "active" | "ended";

type Range = Pick<Project, "startDate" | "endDate">;

/**
 * Whether `date` falls inside the Project's own range.
 *
 * Compared by calendar day, not by instant: the dates are stored at local
 * midnight, so an instant comparison would call a Project ended for the whole
 * of its own last day.
 */
export function coversDate(project: Range, date: Date): boolean {
  const d = toDateInputValue(date);
  return toDateInputValue(project.startDate) <= d && d <= toDateInputValue(project.endDate);
}

/** Where a Project stands on `today`. */
export function projectState(project: Range, today: Date): ProjectState {
  const d = toDateInputValue(today);
  if (d < toDateInputValue(project.startDate)) return "upcoming";
  return d <= toDateInputValue(project.endDate) ? "active" : "ended";
}

/** Running right now — both bounds, not just the end. */
export function isActive(project: Range, today: Date): boolean {
  return projectState(project, today) === "active";
}

/**
 * The Projects worth offering when recording or editing one Financial Event.
 *
 * Showing every Project ever run would grow the picker without bound and put a
 * two-year-old trip beside the one in progress. Filtering to only what runs
 * today would be worse in two directions: it could not file a receipt forgotten
 * during a trip that has since ended, nor a flight booked months before the
 * trip it is for — which ADR-0009 names explicitly. So a Project is offered
 * when any of these holds:
 *
 *  - the event already points at it — editing must never silently drop it;
 *  - it has not ended, so it is running or still to come;
 *  - the event's own date falls inside it — filing late for a finished one.
 */
export function selectableProjects(
  projects: readonly Project[],
  eventDate: Date,
  today: Date,
  attachedId: string | null,
): Project[] {
  return projects.filter(
    (p) =>
      p.id === attachedId ||
      projectState(p, today) !== "ended" ||
      coversDate(p, eventDate),
  );
}

/**
 * The Project that should stamp a new manual entry dated `date`, if any.
 *
 * This is what keeps the recording cost at zero: declaring a Project is the
 * uncommon path and may cost ten seconds, so that recording during one costs
 * nothing extra. Hand-tagging forty entries would invert that.
 *
 * Keyed on the **entry's own date**, not on wall-clock now — the same date the
 * picker follows. Recording during a trip they are the same day; tapping a day
 * heading from before the trip they are not, and stamping by "now" would file
 * a pre-trip grocery run under the trip.
 *
 * Requires the whole range, not just the flag. Nothing fires when time passes,
 * so a Project left auto-assigning keeps the stored flag after it ends;
 * deriving the answer here is what stops last year's trip stamping this year's
 * lunch.
 *
 * `planSetAutoAssign` keeps the flag on one Project per write, but that is not
 * a global guarantee — a restore, or two members switching at once, can leave
 * two set. Taking the first of the caller's list is deterministic (the repo
 * orders by start date, newest first, and `Array.sort` is stable), so the
 * choice is at least repeatable rather than arbitrary per render.
 */
export function stampingProject(projects: readonly Project[], date: Date): Project | null {
  return projects.find((p) => p.autoAssign && coversDate(p, date)) ?? null;
}
