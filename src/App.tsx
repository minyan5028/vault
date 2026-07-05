import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import type { Transaction } from "./domain/types";
import { useAuth } from "./auth/useAuth";
import { provisionPersonalLedger } from "./data/provisionLedger";
import { transactionRepo } from "./data/transactionRepo";
import { materializeRecurring } from "./data/materializeRecurring";
import { useLedgerData } from "./data/useLedgerData";
import { BottomNav, type Tab } from "./components/BottomNav";
import { Timeline } from "./features/timeline/Timeline";
import { QuickEntry } from "./features/quickEntry/QuickEntry";
import { Settings } from "./features/settings/Settings";
import { Stats } from "./features/stats/Stats";
import { Assets } from "./features/assets/Assets";
import { AccountDetail } from "./features/assets/AccountDetail";
import { SignIn } from "./features/auth/SignIn";
import type { Account } from "./domain/types";

/** Auth gate: splash while resolving, sign-in when signed out, else the app. */
export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <SignIn />;
  return <AuthedApp user={user} />;
}

/** null = closed · {} = new entry · { tx } = editing an existing one. */
type Editor = null | { tx?: Transaction };

function AuthedApp({ user }: { user: User }) {
  const { t } = useTranslation();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const [editor, setEditor] = useState<Editor>(null);
  const [accountView, setAccountView] = useState<{ account: Account; balance: number } | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const { accounts, categories } = useLedgerData(ledgerId ?? "");

  useEffect(() => {
    let active = true;
    provisionPersonalLedger(user).then((id) => {
      if (!active) return;
      setLedgerId(id);
      void materializeRecurring(id, user.uid).catch(console.error);
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!undoId) return;
    const timer = setTimeout(() => setUndoId(null), 5000);
    return () => clearTimeout(timer);
  }, [undoId]);

  if (!ledgerId) return <Splash />;

  const deleteTx = (id: string) => {
    void transactionRepo.softDelete(ledgerId, id);
    setUndoId(id);
  };

  return (
    <>
      {tab === "timeline" && (
        <Timeline
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          onEdit={(tx) => setEditor({ tx })}
          onDelete={(tx) => deleteTx(tx.id)}
        />
      )}
      {tab === "stats" && <Stats ledgerId={ledgerId} categories={categories} />}
      {tab === "assets" && (
        <Assets
          ledgerId={ledgerId}
          accounts={accounts}
          onOpenAccount={(account, balance) => setAccountView({ account, balance })}
        />
      )}
      {tab === "settings" && (
        <Settings ledgerId={ledgerId} accounts={accounts} categories={categories} />
      )}

      <BottomNav active={tab} onChange={setTab} />

      {tab === "timeline" && !editor && (
        <button
          type="button"
          onClick={() => setEditor({})}
          aria-label={t("newEntry")}
          className="fixed bottom-20 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl leading-none text-white shadow-lg active:bg-rose-400"
        >
          +
        </button>
      )}

      {accountView && (
        <AccountDetail
          ledgerId={ledgerId}
          account={accountView.account}
          balance={accountView.balance}
          accounts={accounts}
          categories={categories}
          onEdit={(tx) => setEditor({ tx })}
          onDelete={(tx) => deleteTx(tx.id)}
          onBack={() => setAccountView(null)}
        />
      )}

      {editor && (
        <QuickEntry
          key={editor.tx?.id ?? "new"}
          initial={editor.tx}
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          onSubmit={(draft) => {
            if (editor.tx) transactionRepo.update(ledgerId, editor.tx.id, draft);
            else void transactionRepo.add(ledgerId, { ...draft, createdBy: user.uid });
          }}
          onDelete={editor.tx ? () => deleteTx(editor.tx!.id) : undefined}
          onClose={() => setEditor(null)}
        />
      )}

      {undoId && (
        <div className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900 shadow-lg">
          <span>{t("deleted")}</span>
          <button
            type="button"
            onClick={() => {
              void transactionRepo.restore(ledgerId, undoId);
              setUndoId(null);
            }}
            className="font-semibold text-rose-600"
          >
            {t("undo")}
          </button>
        </div>
      )}
    </>
  );
}

function Splash() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 text-slate-400">
      <span className="text-lg font-semibold tracking-tight text-slate-200">{t("appName")}</span>
    </main>
  );
}
