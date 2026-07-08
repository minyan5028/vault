import { formatMoney } from "../../lib/money";
import type { Slice } from "./donutPalette";

const BASE_CURRENCY = "TWD";
const SURFACE = "#0f172a"; // slate-900 — the gap color between slices

const CX = 80;
const CY = 80;
const RO = 76; // outer radius
const RI = 46; // inner radius (donut hole)

const pt = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function arcPath(a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = pt(RO, a0);
  const [ox1, oy1] = pt(RO, a1);
  const [ix1, iy1] = pt(RI, a1);
  const [ix0, iy0] = pt(RI, a0);
  return [
    `M ${ox0} ${oy0}`,
    `A ${RO} ${RO} 0 ${large} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${RI} ${RI} 0 ${large} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

/**
 * Expense-by-category as a donut (magnitude/identity → part-to-whole). Slices
 * carry a 2px surface-gap stroke; a single 100% category renders as a full
 * ring. The center shows the total. Identity is not color-alone — the list
 * beside it repeats each slice's color and names it.
 */
export function CategoryDonut({ slices, total, locale }: { slices: Slice[]; total: number; locale: string }) {
  let a = -Math.PI / 2; // start at 12 o'clock
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const a0 = a;
      const a1 = a + (s.value / total) * Math.PI * 2;
      a = a1;
      return { ...s, a0, a1 };
    });
  const single = segments.length === 1;

  return (
    <svg viewBox="0 0 160 160" className="mx-auto block h-40 w-40" role="img" aria-label="donut">
      {single ? (
        <>
          <circle cx={CX} cy={CY} r={RO} fill={segments[0].color} />
          <circle cx={CX} cy={CY} r={RI} fill={SURFACE} />
        </>
      ) : (
        segments.map((s) => (
          <path key={s.label} d={arcPath(s.a0, s.a1)} fill={s.color} stroke={SURFACE} strokeWidth={2} />
        ))
      )}
      <text
        x={CX}
        y={CY + 4}
        textAnchor="middle"
        className="fill-slate-200"
        style={{ fontSize: 13, fontWeight: 600 }}
      >
        {formatMoney(total, BASE_CURRENCY, locale)}
      </text>
    </svg>
  );
}
