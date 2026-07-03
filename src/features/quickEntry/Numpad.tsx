import type { ButtonHTMLAttributes } from "react";

/** Thumb-friendly numeric keypad. Amount is entered digits-first (see UX.md). */

interface NumpadProps {
  onDigit: (digit: number) => void;
  onBackspace: () => void;
  /** Advance from the amount to the title field. */
  onNext: () => void;
}

export function Numpad({ onDigit, onBackspace, onNext }: NumpadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <Key key={d} onClick={() => onDigit(d)}>
          {d}
        </Key>
      ))}
      <Key onClick={onNext} aria-label="next" className="text-slate-400">
        →
      </Key>
      <Key onClick={() => onDigit(0)}>0</Key>
      <Key onClick={onBackspace} aria-label="backspace">
        ⌫
      </Key>
    </div>
  );
}

function Key({
  children,
  onClick,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-14 rounded-xl bg-slate-800 text-2xl font-medium text-slate-100 " +
        "active:bg-slate-700 transition-colors " +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}
