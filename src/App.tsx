import { formatMoney } from "./lib/money";

/**
 * Placeholder shell. The Quick Entry screen (the 3-second common path, see
 * docs/UX.md) is the next thing to build — deliberately left for a design pass.
 */
export function App() {
  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100 flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Vault</h1>
        <p className="mt-2 text-slate-400">Your personal finance OS.</p>
        <p className="mt-6 text-sm text-slate-500">
          Phase 1 scaffold. Money engine online — e.g.{" "}
          <span className="font-mono text-slate-300">{formatMoney(14990, "TWD")}</span>.
        </p>
      </div>
    </main>
  );
}
