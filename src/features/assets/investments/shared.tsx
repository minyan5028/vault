import type { HoldingClass } from "../../../domain/types";

export const BASE_CURRENCY = "TWD";
export const CLASSES: HoldingClass[] = ["growth", "dividend"];

export const toMinor = (s: string) => Math.round(parseFloat(s || "0") * 100) || 0;
export const toShares = (s: string) => Math.round(parseFloat(s || "0") * 10000) || 0;
export const fromMinor = (n: number) => (n / 100).toString();
export const fromShares = (n: number) => (n / 10000).toString();

export const inputClass =
  "mt-0.5 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600";
