import { createContext, useContext } from "react";
import type { Ledger } from "../domain/types";

interface LedgerNav {
  /** Ledgers the signed-in user belongs to. */
  ledgers: Ledger[];
  /** The Ledger every screen is currently reading. */
  activeId: string;
  /** That Ledger itself — undefined only in the gap before the list arrives.
   *  Provided rather than looked up, so the switcher, the header and the
   *  attribution on the Timeline cannot disagree about which one is active. */
  active: Ledger | undefined;
  /** Ledgers invited to by email but not yet joined. */
  invites: Ledger[];
  onSelect: (ledgerId: string) => void;
  onCreate: (name: string) => void;
  onAccept: (ledgerId: string) => void;
}

const NONE: Ledger[] = [];

const LedgerNavContext = createContext<LedgerNav>({
  ledgers: NONE,
  activeId: "",
  active: undefined,
  invites: NONE,
  onSelect: () => {},
  onCreate: () => {},
  onAccept: () => {},
});

export const LedgerNavProvider = LedgerNavContext.Provider;
export const useLedgerNav = () => useContext(LedgerNavContext);
