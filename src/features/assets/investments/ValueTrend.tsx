import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { shortMoney } from "../../../lib/money";
import { marketValue, toBase, rateToBase } from "../../../lib/holdings";
import type { Holding, PortfolioSnapshot } from "../../../domain/types";
import { BASE_CURRENCY } from "./shared";

/** Portfolio market-value trend from valuation snapshots (each point valued at
 *  that snapshot's own prices + FX). A simple SVG line; hidden below 2 points. */
export function ValueTrend({
  snapshots,
  holdings,
  fx,
  locale,
}: {
  snapshots: PortfolioSnapshot[];
  holdings: Holding[];
  fx: Record<string, number>;
  locale: string;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(() => {
    const curOf = Object.fromEntries(holdings.map((h) => [h.id, h.currency]));
    // Historical points: each valued at that snapshot's own stored FX.
    const pts = snapshots.map((s) => {
      let value = 0;
      for (const [hid, e] of Object.entries(s.entries)) {
        const cur = curOf[hid] ?? BASE_CURRENCY;
        value += toBase(marketValue(e.shares, e.price), rateToBase(cur, s.fx));
      }
      return { date: s.date, value };
    });
    // Live "today" point: current shares/price at the current rate, so the tail
    // always equals the Investments page total (and moves as FX/prices update).
    let nowValue = 0;
    for (const h of holdings) {
      if (h.archived) continue;
      nowValue += toBase(marketValue(h.shares, h.price), rateToBase(h.currency, fx));
    }
    const today = new Date().toISOString().slice(0, 10);
    if (pts.length > 0 && pts[pts.length - 1].date === today) {
      pts[pts.length - 1] = { date: today, value: nowValue };
    } else {
      pts.push({ date: today, value: nowValue });
    }
    return pts;
  }, [snapshots, holdings, fx]);

  if (points.length < 2) return null;

  const n = points.length;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 300;
  const H = 56;
  const posOf = (i: number) => ({
    xPct: (i / (n - 1)) * 100,
    yPct: (1 - (points[i].value - min) / range) * 100,
  });
  const coords = points
    .map((p, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - ((p.value - min) / range) * H).toFixed(1)}`)
    .join(" ");
  const last = points[n - 1].value;
  const change = last - points[0].value;
  const color = change >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">{t("valueTrend")}</p>
        <p className="text-sm font-semibold tabular-nums text-slate-200">
          {shortMoney(last, locale)}
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative h-14 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className={"absolute inset-0 h-full w-full " + color}
            aria-hidden
          >
            <polyline
              points={coords}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Dots (div, so they stay round despite the stretched viewBox) */}
          {points.map((_, i) => {
            const { xPct, yPct } = posOf(i);
            return (
              <div
                key={i}
                className={
                  "absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full " +
                  (hover === i ? "bg-slate-100" : "bg-current " + color)
                }
                style={{ left: `${xPct}%`, top: `${yPct}%` }}
              />
            );
          })}
          {/* Hover / tap columns */}
          <div className="absolute inset-0 flex">
            {points.map((_, i) => (
              <div
                key={i}
                className="flex-1"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              />
            ))}
          </div>
          {/* Tooltip */}
          {hover !== null &&
            (() => {
              const { xPct, yPct } = posOf(hover);
              return (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-700 px-1.5 py-0.5 text-center text-[10px] leading-tight text-slate-100 shadow"
                  style={{ left: `${xPct}%`, top: `calc(${yPct}% - 6px)` }}
                >
                  <div className="tabular-nums font-medium">{shortMoney(points[hover].value, locale)}</div>
                  <div className="text-slate-400">{points[hover].date}</div>
                </div>
              );
            })()}
        </div>
        {/* Y-axis range: high at top, low at bottom */}
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-slate-600">
          <span>{shortMoney(max, locale)}</span>
          <span>{shortMoney(min, locale)}</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{points[0].date}</span>
        <span className={color}>
          {change >= 0 ? "+" : "−"}
          {shortMoney(Math.abs(change), locale)}
        </span>
        <span>{points[n - 1].date}</span>
      </div>
    </div>
  );
}
