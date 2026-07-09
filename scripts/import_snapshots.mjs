/**
 * Import historical valuation snapshots from docs/References/Stocks Recorder.xlsx
 * (the "紀錄" sheet) so the value-trend chart has real history, not just 2 points.
 *
 * Each dated column block holds price + share count per ticker; we map tickers
 * to holding ids and write one snapshots/{date} doc per column. The xlsx has no
 * historical FX, so USD is valued at a flat 32 (matching existing snapshots) —
 * the trend then reflects price × shares moves. Holdings' current denormalized
 * price/shares are NOT touched (these are past snapshots). Merge-writes, so
 * re-runs and the existing 2026-06-30 snapshot are safe.
 *
 * Usage: node scripts/import_snapshots.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
const FX_USD = 32;
const XLSX = "docs/References/Stocks Recorder.xlsx";
const TMAP = {
  DIS: "dis", TXN: "txn", WBD: "wbd", HSY: "hsy", SBUX: "sbux", NVDA: "nvda",
  GOOL: "googl", MSFT: "msft", NFLX: "nflx", "BRK/B": "brk-b", MO: "mo", O: "o", T: "t",
};

// --- unzip + parse the xlsx ---
const dir = join(tmpdir(), "vault_snap_import");
execSync(`rm -rf "${dir}" && mkdir -p "${dir}" && unzip -o "${XLSX}" -d "${dir}"`, { stdio: "ignore" });
const ss = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
const strings = [];
for (const m of ss.matchAll(/<si>(.*?)<\/si>/gs))
  strings.push([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(""));
const sheet = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");
const rows = {};
for (const m of sheet.matchAll(
  /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(?:<v>([^<]*)<\/v>)?(?:<is><t[^>]*>([^<]*)<\/t><\/is>)?<\/c>)/g,
)) {
  const [, col, row, attrs, v, inl] = m;
  let val = inl ?? v ?? "";
  if (/t="s"/.test(attrs) && v !== undefined) val = strings[parseInt(v)] ?? "";
  (rows[row] ??= {})[col] = val;
}
const colIdx = (c) => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const idxCol = (n) => { let s = ""; n++; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
const serialToDate = (s) => new Date(Math.round((s - 25569) * 86400000)).toISOString().slice(0, 10);

const r1 = rows["1"] || {}, r2 = rows["2"] || {};
const dateCols = Object.keys(r2)
  .filter((c) => r2[c] === "price" && r1[c] && !isNaN(+r1[c]))
  .sort((a, b) => colIdx(a) - colIdx(b));
const tickerRows = [];
for (let r = 3; r <= 16; r++) {
  const b = rows[String(r)]?.B;
  if (b && TMAP[b]) tickerRows.push([r, TMAP[b]]);
}

const snaps = [];
for (const pc of dateCols) {
  const sc = idxCol(colIdx(pc) + 1);
  const date = serialToDate(+r1[pc]);
  const entries = {};
  for (const [r, hid] of tickerRows) {
    const price = rows[String(r)]?.[pc], sh = rows[String(r)]?.[sc];
    if (price != null && price !== "" && sh != null && sh !== "" && !isNaN(+price) && !isNaN(+sh))
      entries[hid] = { price: Math.round(+price * 100), shares: Math.round(+sh * 10000) };
  }
  if (Object.keys(entries).length) snaps.push({ date, entries });
}
snaps.sort((a, b) => a.date.localeCompare(b.date));

console.log(`${commit ? "COMMIT" : "DRY RUN"} — ${snaps.length} snapshots @ USD ${FX_USD}\n`);
for (const s of snaps) console.log(`  ${s.date}  ${Object.keys(s.entries).length} holdings`);

if (!commit) {
  console.log("\nDry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}

const sa = JSON.parse(readFileSync("serviceAccountKey.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);
const batch = db.batch();
for (const s of snaps)
  batch.set(led.collection("snapshots").doc(s.date), { date: s.date, entries: s.entries, fx: { USD: FX_USD } }, { merge: true });
await batch.commit();
console.log("\n✓ Committed.");
process.exit(0);
