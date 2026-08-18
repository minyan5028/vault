import { describe, it, expect } from "vitest";
import {
  projectState,
  isActive,
  coversDate,
  selectableProjects,
  stampingProject,
} from "./project";
import type { Project } from "../domain/types";

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const tokyo = { startDate: on(2026, 3, 12), endDate: on(2026, 3, 18) };

describe("projectState", () => {
  it("is upcoming before the start date", () => {
    expect(projectState(tokyo, on(2026, 3, 11))).toBe("upcoming");
  });

  it("becomes active on the start date itself", () => {
    expect(projectState(tokyo, on(2026, 3, 12))).toBe("active");
  });

  it("is still active on the end date itself, all day", () => {
    expect(projectState(tokyo, new Date(2026, 2, 18, 0, 0))).toBe("active");
    expect(projectState(tokyo, new Date(2026, 2, 18, 23, 59))).toBe("active");
  });

  it("has ended the day after", () => {
    expect(projectState(tokyo, new Date(2026, 2, 19, 0, 1))).toBe("ended");
  });

  it("compares by calendar day, not by instant — the dates are stored at midnight", () => {
    // An instant comparison would call this ended at 00:01 on its own last day.
    expect(isActive(tokyo, new Date(2026, 2, 18, 0, 1))).toBe(true);
  });

  it("treats a one-day project as active on that day", () => {
    const day = { startDate: on(2026, 5, 1), endDate: on(2026, 5, 1) };
    expect(projectState(day, on(2026, 4, 30))).toBe("upcoming");
    expect(projectState(day, on(2026, 5, 1))).toBe("active");
    expect(projectState(day, on(2026, 5, 2))).toBe("ended");
  });

  it("spans a year boundary correctly", () => {
    const newYear = { startDate: on(2026, 12, 28), endDate: on(2027, 1, 2) };
    expect(projectState(newYear, on(2026, 12, 31))).toBe("active");
    expect(projectState(newYear, on(2027, 1, 3))).toBe("ended");
  });
});

const project = (id: string, start: [number, number, number], end: [number, number, number]): Project => ({
  id,
  name: id,
  startDate: on(...start),
  endDate: on(...end),
  autoAssign: false,
  deletedAt: null,
});

describe("coversDate", () => {
  const trip = project("tokyo", [2026, 3, 12], [2026, 3, 18]);

  it("covers both endpoints", () => {
    expect(coversDate(trip, on(2026, 3, 12))).toBe(true);
    expect(coversDate(trip, on(2026, 3, 18))).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(coversDate(trip, on(2026, 3, 11))).toBe(false);
    expect(coversDate(trip, on(2026, 3, 19))).toBe(false);
  });
});

describe("selectableProjects", () => {
  const tokyo = project("tokyo", [2026, 3, 12], [2026, 3, 18]); // long over
  const reno = project("reno", [2026, 7, 1], [2026, 9, 30]); // running
  const wedding = project("wedding", [2025, 5, 1], [2025, 5, 3]); // ancient
  const all = [tokyo, reno, wedding];
  const today = on(2026, 8, 18);
  const ids = (ps: Project[]) => ps.map((p) => p.id);

  it("offers the Project running today", () => {
    expect(ids(selectableProjects(all, today, today, null))).toEqual(["reno"]);
  });

  it("drops Projects that ended long ago", () => {
    expect(ids(selectableProjects(all, today, today, null))).not.toContain("wedding");
  });

  it("offers an ended Project when the entry's own date falls inside it — a receipt filed late", () => {
    expect(ids(selectableProjects(all, on(2026, 3, 15), today, null))).toEqual(["tokyo", "reno"]);
  });

  it("always offers the Project the event already points at, however old", () => {
    expect(ids(selectableProjects(all, today, today, "wedding"))).toEqual(["reno", "wedding"]);
  });

  it("offers a Project that has not started yet — booking a flight months ahead", () => {
    const kyoto = project("kyoto", [2026, 12, 1], [2026, 12, 9]);
    expect(ids(selectableProjects([...all, kyoto], today, today, null))).toEqual(["reno", "kyoto"]);
  });

  it("offers nothing when the Ledger has none", () => {
    expect(selectableProjects([], today, today, null)).toEqual([]);
  });
});

describe("stampingProject", () => {
  const today = on(2026, 8, 18);
  const running = { ...project("reno", [2026, 7, 1], [2026, 9, 30]), autoAssign: true };
  const runningOff = project("tokyo", [2026, 8, 1], [2026, 8, 31]);

  it("names the Project that is auto-assigning and running today", () => {
    expect(stampingProject([running, runningOff], today)?.id).toBe("reno");
  });

  it("stamps nothing when no Project is auto-assigning", () => {
    expect(stampingProject([runningOff], today)).toBeNull();
  });

  it("stamps nothing when the auto-assigning Project has ended", () => {
    // The flag can outlive the Project: nothing fires when time passes, so the
    // guarantee has to be derived, not stored.
    const stale = { ...project("lastyear", [2025, 3, 1], [2025, 3, 8]), autoAssign: true };
    expect(stampingProject([stale], today)).toBeNull();
  });

  it("stamps nothing before the Project has started", () => {
    const future = { ...project("kyoto", [2026, 12, 1], [2026, 12, 9]), autoAssign: true };
    expect(stampingProject([future], today)).toBeNull();
  });

  it("stamps on the first and last day of the range", () => {
    const trip = { ...project("tokyo", [2026, 8, 18], [2026, 8, 24]), autoAssign: true };
    expect(stampingProject([trip], on(2026, 8, 18))?.id).toBe("tokyo");
    expect(stampingProject([trip], on(2026, 8, 24))?.id).toBe("tokyo");
    expect(stampingProject([trip], on(2026, 8, 25))).toBeNull();
  });

  it("stamps nothing for an empty Ledger", () => {
    expect(stampingProject([], today)).toBeNull();
  });

  it("keys on the entry's own date, not on today", () => {
    // Recording a forgotten grocery run from before the trip, while the trip is
    // still running. Stamping by wall-clock now would file it under the trip.
    const trip = { ...project("tokyo", [2026, 8, 10], [2026, 8, 20]), autoAssign: true };
    expect(stampingProject([trip], on(2026, 8, 18))?.id).toBe("tokyo");
    expect(stampingProject([trip], on(2026, 8, 3))).toBeNull();
    expect(stampingProject([trip], on(2026, 8, 25))).toBeNull();
  });
});
