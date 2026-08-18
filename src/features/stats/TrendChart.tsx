import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";

const EXPENSE = "#f43f5e"; // rose-500 — matches the app's expense semantics
const INCOME = "#0ea5e9"; // sky-500 — matches the app's income semantics
const PROJECT = "#f59e0b"; // amber-500 — a third identity, not a shade of expense
const BASE_CURRENCY = "TWD";

// Internal coordinate space; the SVG scales responsively to its container.
const W = 340;
const H = 180;
const L = 10;
const R = 330;
const TOP = 26;
const BOT = 156;

export interface TrendPoint {
  ym: string;
  expense: number;
  income: number;
  /** Expense minus what the Projects accounted for (ADR-0009). */
  everyday: number;
}

/**
 * Monthly income/expense trend (change-over-time → line). Two series on one
 * axis (same unit, TWD); expense rose, income sky, matching the app's
 * semantics. The selected month is emphasized and directly labelled; tapping a
 * month is emphasized and directly labelled. Legend + labels give identity
 * beyond color (accessibility). Read-only — navigate months with the header.
 *
 * When any month carries Project spending, a third band appears: the everyday
 * line runs below the expense line and the gap between them is shaded. The
 * expense line itself never moves — the total is the total — so a travel
 * month's spike is *explained* rather than flattened away, which is the whole
 * point of separating the two (ADR-0009).
 */
export function TrendChart({
  points,
  selected,
  locale,
}: {
  points: TrendPoint[];
  selected: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const n = points.length;
  const max = Math.max(1, ...points.flatMap((p) => [p.expense, p.income]));
  const x = (i: number) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const y = (v: number) => BOT - (v / max) * (BOT - TOP);
  const line = (key: "expense" | "income" | "everyday") =>
    points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  // Only worth the extra ink when there is Project spending to explain.
  const hasProjects = points.some((p) => p.expense !== p.everyday);
  // The shaded gap: down the expense line, back along the everyday line.
  const band =
    line("expense") +
    " " +
    points
      .map((_, i) => n - 1 - i)
      .map((j) => `${x(j)},${y(points[j].everyday)}`)
      .join(" ");

  const selIdx = points.findIndex((p) => p.ym === selected);
  const sel = selIdx >= 0 ? points[selIdx] : null;
  const monthNum = (ym: string) => Number(ym.split("-")[1]);

  return (
    <figure className="mt-4">
      {/* Legend — identity is never color-alone */}
      <figcaption className="mb-2 flex items-center justify-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: EXPENSE }} />
          {t("expense")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: INCOME }} />
          {t("income")}
        </span>
        {hasProjects && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: PROJECT }} />
            {t("projects")}
          </span>
        )}
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("trend")}>
        {/* recessive baseline */}
        <line x1={L} y1={BOT} x2={R} y2={BOT} stroke="#1e293b" strokeWidth={1} />

        {hasProjects && (
          <>
            <polygon points={band} fill={PROJECT} fillOpacity={0.22} />
            <polyline
              points={line("everyday")}
              fill="none"
              stroke={EXPENSE}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        <polyline
          points={line("income")}
          fill="none"
          stroke={INCOME}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line("expense")}
          fill="none"
          stroke={EXPENSE}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => {
          const on = p.ym === selected;
          return (
            <g key={p.ym}>
              <circle cx={x(i)} cy={y(p.income)} r={on ? 4 : 2.5} fill={INCOME} />
              <circle
                cx={x(i)}
                cy={y(p.expense)}
                r={on ? 4 : 2.5}
                fill={EXPENSE}
                stroke={on ? "#0f172a" : "none"}
                strokeWidth={on ? 1.5 : 0}
              />
              {/* month tick */}
              <text
                x={x(i)}
                y={H - 4}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 9 }}
              >
                {monthNum(p.ym)}
              </text>
            </g>
          );
        })}

        {/* direct value label on the selected month's expense point */}
        {sel && (
          <text
            x={Math.min(Math.max(x(selIdx), 34), R - 34)}
            y={y(sel.expense) - 8 > 14 ? y(sel.expense) - 8 : y(sel.expense) + 16}
            textAnchor="middle"
            className="fill-slate-200"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {formatMoney(sel.expense, BASE_CURRENCY, locale)}
          </text>
        )}
      </svg>
    </figure>
  );
}
