import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import type { Transaction } from "./domain/types";
import { useAuth } from "./auth/useAuth";
import { provisionPersonalLedger } from "./data/provisionLedger";
import { transactionRepo } from "./data/transactionRepo";
import { useLedgerData } from "./data/useLedgerData";
import { Timeline } from "./features/timeline/Timeline";
import { QuickEntry } from "./features/quickEntry/QuickEntry";
import { Settings } from "./features/settings/Settings";
import { Stats } from "./features/stats/Stats";
import { SignIn } from "./features/auth/SignIn";

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
  const [editor, setEditor] = useState<Editor>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const { accounts, categories } = useLedgerData(ledgerId ?? "");

  useEffect(() => {
    let active = true;
    provisionPersonalLedger(user).then((id) => active && setLedgerId(id));
    return () => {
      active = false;
    };
  }, [user]);

  // Auto-dismiss the undo snackbar.
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
      <Timeline
        ledgerId={ledgerId}
        accounts={accounts}
        categories={categories}
        onEdit={(tx) => setEditor({ tx })}
        onDelete={(tx) => deleteTx(tx.id)}
        onSettings={() => setSettingsOpen(true)}
        onStats={() => setStatsOpen(true)}
      />

      {settingsOpen && (
        <Settings
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {statsOpen && (
        <Stats
          ledgerId={ledgerId}
          categories={categories}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {!editor && !settingsOpen && !statsOpen && (
        <button
          type="button"
          onClick={() => setEditor({})}
          aria-label={t("newEntry")}
          className="fixed bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl leading-none text-white shadow-lg active:bg-rose-400"
        >
          +
        </button>
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
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900 shadow-lg">
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
