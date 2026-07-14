import { useCallback, useState } from "react";
import { setAmountsHidden } from "./money";

const KEY = "vault:hideAmounts";

// Seed the module flag from storage at load, before the first render, so
// amounts start hidden if that's how the user left them (avoids a flash).
const initial =
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
setAmountsHidden(initial);

/**
 * Presentation privacy toggle: hide all amounts (and share counts) for demos /
 * screen-sharing. Flips the money.ts module flag and re-renders so every
 * formatMoney/shortMoney call re-reads it; persisted in localStorage.
 */
export function useAmountVisibility(): { hidden: boolean; toggle: () => void } {
  const [hidden, setHidden] = useState(initial);
  const toggle = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      setAmountsHidden(next);
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // ignore storage failures (private mode etc.)
      }
      return next;
    });
  }, []);
  return { hidden, toggle };
}
