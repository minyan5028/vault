import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ledgerRepo } from "../../data/ledgerRepo";
import type { Ledger } from "../../domain/types";

/** Members, invites and deletion for one ledger (sharing). */
export function LedgerSettings({
  ledger,
  uid,
  onClose,
  onDeleted,
}: {
  ledger: Ledger;
  uid: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);

  const isOwner = ledger.members[uid] === "owner";
  const isPersonal = ledger.id === uid;
  const memberRows = Object.entries(ledger.members);

  function invite() {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return;
    void ledgerRepo.invite(ledger.id, e);
    setEmail("");
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-10 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">{ledger.name}</span>
          <span className="w-8" />
        </header>

        {/* Members */}
        <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("members")}</h2>
        <ul className="mb-6 divide-y divide-slate-800 overflow-hidden rounded-xl bg-slate-800/40">
          {memberRows.map(([mid, role]) => (
            <li key={mid} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-slate-200">{mid === uid ? t("you") : t("role_member")}</span>
              <span className="text-xs text-slate-500">
                {t(role === "owner" ? "role_owner" : "role_member")}
              </span>
            </li>
          ))}
        </ul>

        {/* Invite by email (owner/member) */}
        <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("inviteEmail")}</h2>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="name@gmail.com"
            className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={invite}
            disabled={!email.includes("@")}
            className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-30"
          >
            {t("invite")}
          </button>
        </div>

        {ledger.invitedEmails.length > 0 && (
          <>
            <h2 className="mb-2 mt-6 text-xs uppercase tracking-wide text-slate-500">
              {t("pendingInvites")}
            </h2>
            <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl bg-slate-800/40">
              {ledger.invitedEmails.map((e) => (
                <li key={e} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="truncate text-slate-300">{e}</span>
                  <button
                    type="button"
                    onClick={() => void ledgerRepo.cancelInvite(ledger.id, e)}
                    className="shrink-0 text-xs text-slate-500 hover:text-rose-400"
                  >
                    {t("cancel")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Delete (owner only, never the personal ledger) */}
        {isOwner && !isPersonal && (
          <div className="mt-10">
            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">{t("deleteLedgerConfirm")}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void ledgerRepo.remove(ledger.id).then(onDeleted);
                    }}
                    className="h-11 flex-1 rounded-xl bg-rose-600 text-sm font-semibold text-white"
                  >
                    {t("deleteLedger")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="h-11 flex-1 rounded-xl bg-slate-800 text-sm font-medium text-slate-300"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="h-11 w-full rounded-xl text-sm font-medium text-rose-400 active:bg-slate-800"
              >
                {t("deleteLedger")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
