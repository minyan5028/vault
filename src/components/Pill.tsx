import type { ReactNode } from "react";

/** A pill / segmented-control button with the app's shared active/inactive
 *  styling. Used for the Timeline type filter, Stats period/view tabs, etc. */
export function Pill({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={
        "rounded-full px-3 py-1 " +
        (active ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400")
      }
    >
      {children}
    </button>
  );
}
