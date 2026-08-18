import { describe, it, expect } from "vitest";
import { projectState, isActive, coversDate, selectableProjects } from "./project";
import type { Project } from "../domain/types";

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const tokyo = { endDate: on(2026, 3, 18) };

describe("projectState", () => {
  it("is active before the end date", () => {
    expect(projectState(tokyo, on(2026, 3, 12))).toBe("active");
  });

  it("is still active on the end date itself, all day", () => {
    expect(projectState(tokyo, new Date(2026, 2, 18, 0, 0))).toBe("active");
    expect(projectState(tokyo, new Date(2026, 2, 18, 23, 59))).toBe("active");
  });

  it("has ended the day after", () => {
    expect(projectState(tokyo, new Date(2026, 2, 19, 0, 1))).toBe("ended");
  });

  it("compares by calendar day, not by instant — the end date is stored at midnight", () => {
    // An instant comparison would call this ended at 00:01 on its own last day.
    expect(isActive(tokyo, new Date(2026, 2, 18, 0, 1))).toBe(true);
  });

  it("treats a one-day project as active on that day", () => {
    const day = { endDate: on(2026, 5, 1) };
    expect(projectState(day, on(2026, 5, 1))).toBe("active");
    expect(projectState(day, on(2026, 5, 2))).toBe("ended");
  });

  it("spans a year boundary correctly", () => {
    const newYear = { endDate: on(2027, 1, 2) };
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

  it("offers nothing when the Ledger has none", () => {
    expect(selectableProjects([], today, today, null)).toEqual([]);
  });
});
