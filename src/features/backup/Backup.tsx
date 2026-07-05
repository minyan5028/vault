import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildBackup, backupToCsv, importBackup, type Backup as BackupData } from "../../data/backup";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

export function Backup({ ledgerId, onClose }: { ledgerId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function exportJson() {
    setBusy(true);
    try {
      const b = await buildBackup(ledgerId);
      download(`vault-backup-${today()}.json`, JSON.stringify(b, null, 2), "application/json");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const b = await buildBackup(ledgerId);
      // Prepend a BOM so Excel reads UTF-8 (Chinese) correctly.
      download(`vault-transactions-${today()}.csv`, "﻿" + backupToCsv(b), "text/csv");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File) {
    setBusy(true);
    setStatus("");
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      const res = await importBackup(ledgerId, data);
      const n = Object.values(res).reduce((a, b) => a + b, 0);
      setStatus(t("imported", { n }));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  const btn = "h-12 w-full rounded-xl bg-slate-800 text-sm font-medium text-slate-100 active:bg-slate-700 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md space-y-3 px-4 pb-10 pt-4">
        <header className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">{t("backup")}</span>
          <span className="w-8" />
        </header>

        <button type="button" onClick={exportJson} disabled={busy} className={btn}>
          {t("exportJson")}
        </button>
        <button type="button" onClick={exportCsv} disabled={busy} className={btn}>
          {t("exportCsv")}
        </button>

        <label className={btn + " flex cursor-pointer items-center justify-center"}>
          {t("importJson")}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
        </label>

        <p className="text-xs text-slate-500">{t("importNote")}</p>
        {status && <p className="text-sm text-slate-300">{status}</p>}
      </div>
    </div>
  );
}
