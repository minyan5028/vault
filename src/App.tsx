import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import type { Account, Ledger, Transaction } from "./domain/types";
import { useAuth } from "./auth/useAuth";
import { provisionPersonalLedger } from "./data/provisionLedger";
import { transactionRepo } from "./data/transactionRepo";
import { materializeRecurring } from "./data/materializeRecurring";
import { useLedgerData } from "./data/useLedgerData";
import { useFxAutoRefresh } from "./data/useFxAutoRefresh";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAmountVisibility } from "./lib/useAmountVisibility";
import { useStockReminder } from "./data/useStockReminder";
import { AppNavProvider } from "./components/appNav";
import { useUserLedgers } from "./data/useUserLedgers";
import { useMyInvites } from "./data/useMyInvites";
import { ledgerRepo } from "./data/ledgerRepo";
import { BottomNav, type Tab } from "./components/BottomNav";
import { Timeline } from "./features/timeline/Timeline";
import { QuickEntry } from "./features/quickEntry/QuickEntry";
import { Settings } from "./features/settings/Settings";
import { Stats } from "./features/stats/Stats";
import { Assets } from "./features/assets/Assets";
import { AccountDetail } from "./features/assets/AccountDetail";
import { SignIn } from "./features/auth/SignIn";

/** Auth gate: splash while resolving, sign-in when signed out, else the app. */
export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <SignIn />;
  return <AuthedApp user={user} />;
}

/** null = closed · {} = new entry · { tx } = editing an existing one. */
type Editor = null | { tx?: Transaction; copy?: boolean };

const activeLedgerKey = (uid: string) => `vault.ledger.${uid}`;

function AuthedApp({ user }: { user: User }) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [ledgerId, setLedgerId] = useState<string>(
    () => localStorage.getItem(activeLedgerKey(user.uid)) ?? user.uid,
  );
  const [tab, setTab] = useState<Tab>("timeline");
  const [editor, setEditor] = useState<Editor>(null);
  const [accountView, setAccountView] = useState<{ account: Account; balance: number } | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  // Optimistic ledgers shown immediately after creation, until the live query
  // catches up (so a new ledger appears in the switcher without a refresh).
  const [pending, setPending] = useState<Ledger[]>([]);
  const subscribed = useUserLedgers(user.uid);
  const invites = useMyInvites(user.email);
  const ledgers = useMemo(
    () => [...subscribed, ...pending.filter((p) => !subscribed.some((l) => l.id === p.id))],
    [subscribed, pending],
  );
  const activeLedger = ledgers.find((l) => l.id === ledgerId);
  const { accounts, categories } = useLedgerData(ready ? ledgerId : "");
  useFxAutoRefresh(ready ? ledgerId : "", accounts);
  const amounts = useAmountVisibility();
  const stockReminderDue = useStockReminder(ready ? ledgerId : "");
  const myProfile = useMemo(
    () => ({ name: user.displayName ?? "", email: user.email ?? "" }),
    [user.displayName, user.email],
  );

  useEffect(() => {
    setPending((p) => p.filter((pl) => !subscribed.some((l) => l.id === pl.id)));
  }, [subscribed]);

  // Ensure the personal ledger exists, then reveal the app.
  useEffect(() => {
    let active = true;
    provisionPersonalLedger(user)
      .catch((e) => console.error("provision", e))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [user]);

  // Validate the persisted active ledger once (after the first list loads), so
  // a stale/left ledger falls back to personal — but don't fight a just-created
  // ledger that the subscription hasn't delivered yet.
  const validatedRef = useRef(false);
  useEffect(() => {
    if (validatedRef.current || !ledgers.length) return;
    validatedRef.current = true;
    if (!ledgers.some((l) => l.id === ledgerId)) setLedgerId(user.uid);
  }, [ledgers, ledgerId, user.uid]);

  // Persist the active ledger and catch up its recurring transactions.
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(activeLedgerKey(user.uid), ledgerId);
    void materializeRecurring(ledgerId, user.uid).catch(console.error);
  }, [ready, ledgerId, user.uid]);

  // Self-register my display info on every ledger I belong to (once, when it's
  // missing or my name/email changed) so other members can attribute my entries.
  useEffect(() => {
    if (!ready) return;
    for (const l of subscribed) {
      const cur = l.memberProfiles[user.uid];
      if (cur && cur.name === myProfile.name && cur.email === myProfile.email) continue;
      void ledgerRepo.setMemberProfile(l.id, user.uid, myProfile).catch(console.error);
    }
  }, [ready, subscribed, user.uid, myProfile]);

  useEffect(() => {
    if (!undoId) return;
    const timer = setTimeout(() => setUndoId(null), 5000);
    return () => clearTimeout(timer);
  }, [undoId]);

  if (!ready) return <Splash />;

  const deleteTx = (id: string) => {
    void transactionRepo.softDelete(ledgerId, id);
    setUndoId(id);
  };

  const createLedger = (name: string) => {
    void ledgerRepo.create(user.uid, name, "TWD", myProfile).then((id) => {
      setPending((p) => [
        ...p,
        {
          id,
          name,
          baseCurrency: "TWD",
          members: { [user.uid]: "owner" },
          memberIds: [user.uid],
          invitedEmails: [],
          memberProfiles: { [user.uid]: myProfile },
          createdBy: user.uid,
          createdAt: new Date(),
        },
      ]);
      setTab("timeline");
      setLedgerId(id);
    });
  };

  const acceptInvite = (id: string) => {
    if (!user.email) return;
    void ledgerRepo.accept(id, user.uid, user.email).then(() => {
      setTab("timeline");
      setLedgerId(id);
    });
  };

  return (
    <AppNavProvider
      value={{ reminderCount: stockReminderDue ? 1 : 0, onLogoClick: () => setTab("assets") }}
    >
      <ErrorBoundary key={tab}>
      {tab === "timeline" && (
        <Timeline
          ledgerId={ledgerId}
          currentUid={user.uid}
          accounts={accounts}
          categories={categories}
          ledgers={ledgers}
          invites={invites}
          onSelectLedger={setLedgerId}
          onCreateLedger={createLedger}
          onAcceptInvite={acceptInvite}
          onEdit={(tx) => setEditor({ tx })}
          onDelete={(tx) => deleteTx(tx.id)}
        />
      )}
      {tab === "stats" && (
        <Stats
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          onEdit={(tx) => setEditor({ tx })}
          onDelete={(tx) => deleteTx(tx.id)}
        />
      )}
      {tab === "assets" && (
        <Assets
          ledgerId={ledgerId}
          accounts={accounts}
          uid={user.uid}
          onOpenAccount={(account, balance) => setAccountView({ account, balance })}
        />
      )}
      {tab === "settings" && (
        <Settings
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          ledger={activeLedger}
          uid={user.uid}
          amountsHidden={amounts.hidden}
          onToggleAmounts={amounts.toggle}
          onLedgerDeleted={() => setLedgerId(user.uid)}
        />
      )}
      </ErrorBoundary>

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
          key={editor.copy ? "copy" : (editor.tx?.id ?? "new")}
          initial={editor.tx}
          ledgerId={ledgerId}
          accounts={accounts}
          categories={categories}
          onSubmit={(draft) => {
            if (editor.tx && !editor.copy) transactionRepo.update(ledgerId, editor.tx.id, draft);
            else void transactionRepo.add(ledgerId, { ...draft, createdBy: user.uid });
          }}
          onDelete={editor.tx && !editor.copy ? () => deleteTx(editor.tx!.id) : undefined}
          onCopy={
            editor.tx && !editor.copy ? () => setEditor({ tx: editor.tx, copy: true }) : undefined
          }
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
    </AppNavProvider>
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
