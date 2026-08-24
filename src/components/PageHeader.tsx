import type { ReactNode } from "react";
import { AppLogo } from "./AppLogo";
import { LedgerSwitcher } from "./LedgerSwitcher";

/**
 * The header every primary screen shares: the Vault mark, then the active
 * Ledger's name as the control that changes it.
 *
 * No screen puts its own title here. Page identity is already carried by the
 * bottom tab bar (icon, label, active colour), so the title text would be
 * redundant — and spending the header on the Ledger name instead is what makes
 * "which Ledger am I in" something you cannot avoid seeing rather than
 * something you have to go and ask.
 *
 * `children` sit at the trailing edge for a screen that needs a control up
 * there (Stats' period pills); the Ledger name keeps its place regardless.
 */
export function PageHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 py-3">
      <AppLogo />
      <div className="min-w-0 flex-1">
        <LedgerSwitcher />
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </header>
  );
}
