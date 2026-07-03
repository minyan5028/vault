import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { useAuth } from "./auth/useAuth";
import { provisionPersonalLedger } from "./data/provisionLedger";
import { transactionRepo } from "./data/transactionRepo";
import { Timeline } from "./features/timeline/Timeline";
import { QuickEntry } from "./features/quickEntry/QuickEntry";
import { SignIn } from "./features/auth/SignIn";

/** Auth gate: splash while resolving, sign-in when signed out, else the app. */
export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <SignIn />;
  return <AuthedApp user={user} />;
}

function AuthedApp({ user }: { user: User }) {
  const { t } = useTranslation();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);

  useEffect(() => {
    let active = true;
    provisionPersonalLedger(user).then((id) => {
      if (active) setLedgerId(id);
    });
    return () => {
      active = false;
    };
  }, [user]);

  if (!ledgerId) return <Splash />;

  return (
    <>
      <Timeline ledgerId={ledgerId} />

      {!entryOpen && (
        <button
          type="button"
          onClick={() => setEntryOpen(true)}
          aria-label={t("newEntry")}
          className="fixed bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-3xl leading-none text-white shadow-lg active:bg-rose-400"
        >
          +
        </button>
      )}

      {entryOpen && (
        <QuickEntry
          onSubmit={(draft) =>
            void transactionRepo.add(ledgerId, { ...draft, createdBy: user.uid })
          }
          onClose={() => setEntryOpen(false)}
        />
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
