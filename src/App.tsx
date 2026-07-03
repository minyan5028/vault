import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Timeline } from "./features/timeline/Timeline";
import { QuickEntry } from "./features/quickEntry/QuickEntry";
import type { SessionEntry } from "./features/entries";

/**
 * Vault opens on the Timeline; a bottom-right FAB opens Quick Entry as an
 * overlay (see docs/UX.md). Entries live here in memory until Firestore is
 * wired up.
 */
export function App() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [entryOpen, setEntryOpen] = useState(false);

  return (
    <>
      <Timeline entries={entries} />

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
          onSave={(entry) => setEntries((prev) => [entry, ...prev])}
          onClose={() => setEntryOpen(false)}
        />
      )}
    </>
  );
}
