#!/usr/bin/env python3
"""
Migrate the Notion "Expenses" CSV export into Vault's Firestore data model.

Output: a single JSON seed file with `ledger`, `accounts`, `categories`,
and `transactions`, shaped to match docs/DATA_MODEL.md. A separate loader
(Firebase Admin SDK) writes these documents into Firestore later.

Usage:
    python3 scripts/migrate_notion.py \
        --input "data/.../Expenses ..._all.csv" \
        --output data/migrated/vault-seed.json

If --input is omitted, the script auto-finds the *_all.csv under data/.
"""
from __future__ import annotations
import argparse, csv, glob, json, os, re, sys, uuid, hashlib
from datetime import datetime, timezone, timedelta

# --- config -----------------------------------------------------------------
LEDGER_ID = "personal"
LEDGER_NAME = "Personal"
BASE_CURRENCY = "TWD"
OWNER_UID = "owner"          # placeholder; remap to the real Firebase uid on load
TZ = timezone(timedelta(hours=8))   # source dates are naive Taipei local time

# Every amount is stored as an integer scaled by a single fixed factor of 100
# (2 decimal places for all currencies), so TWD 5,806 -> 580600. UI divides by
# 100 to display and multiplies by 100 to store. See docs/DATA_MODEL.md.
MINOR_SCALE = 100


def slug(name: str) -> str:
    """Stable, human-readable id from a name. Falls back to a hash for
    non-ASCII-only names so ids stay unique and Firestore-safe."""
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if s:
        return s
    return "x-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:8]


def strip_notion_link(v: str | None) -> str:
    """Notion exports relations as 'Name (https://...)'. Keep just the name."""
    return re.sub(r"\s*\(https://[^)]*\)", "", v or "").strip()


def to_minor(amount_str: str) -> int:
    raw = (amount_str or "").replace("NT$", "").replace(",", "").strip()
    if not raw:
        raise ValueError("empty amount")
    # Use Decimal to avoid float drift; single fixed scale of 100 for every currency.
    from decimal import Decimal
    return int((Decimal(raw) * MINOR_SCALE).to_integral_value())


def parse_date(v: str) -> datetime:
    v = (v or "").strip()
    # Some rows carry a time + "(GMT+8)" suffix; strip the suffix first.
    v = re.sub(r"\s*\(GMT[^)]*\)\s*$", "", v).strip()
    for fmt in ("%Y/%m/%d %I:%M %p", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).replace(tzinfo=TZ)
        except ValueError:
            continue
    raise ValueError(f"unrecognized date: {v!r}")


def find_input() -> str:
    hits = glob.glob(
        os.path.join(os.path.dirname(__file__), "..", "data", "**", "Expenses*_all.csv"),
        recursive=True,
    )
    if not hits:
        sys.exit("No Expenses*_all.csv found under data/. Pass --input explicitly.")
    return hits[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--output", default=os.path.join(
        os.path.dirname(__file__), "..", "data", "migrated", "vault-seed.json"))
    args = ap.parse_args()

    path = args.input or find_input()
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))

    accounts: dict[str, dict] = {}
    categories: dict[str, dict] = {}
    transactions: list[dict] = []
    skipped: list[tuple[int, str]] = []

    for i, r in enumerate(rows, start=2):  # +2: header is line 1
        try:
            cat_name = strip_notion_link(r.get("Category"))
            acc_name = strip_notion_link(r.get("Account"))
            title = (r.get("Expense") or "").strip()
            note = (r.get("Detail") or "").strip()
            dt = parse_date(r.get("Date"))
            amount = to_minor(r.get("Amount"))

            if not acc_name or not cat_name:
                raise ValueError("missing account or category")

            acc_id = slug(acc_name)
            if acc_id not in accounts:
                accounts[acc_id] = {
                    "id": acc_id, "name": acc_name, "type": "other",
                    "currency": BASE_CURRENCY, "archived": False,
                    "sortOrder": len(accounts),
                }
            cat_id = slug(cat_name)
            if cat_id not in categories:
                categories[cat_id] = {
                    "id": cat_id, "name": cat_name, "type": "expense",
                    "icon": None, "parentId": None, "archived": False,
                    "sortOrder": len(categories),
                }

            transactions.append({
                "id": str(uuid.uuid4()),
                "type": "expense",
                "amount": amount,
                "currency": BASE_CURRENCY,
                # All Notion data is in the base currency, so FX is a no-op:
                # baseAmount == amount, fxRate == 1.
                "baseAmount": amount,
                "baseCurrency": BASE_CURRENCY,
                "fxRate": 1.0,
                "date": dt.isoformat(),
                "yearMonth": dt.strftime("%Y-%m"),
                "categoryId": cat_id,
                "accountId": acc_id,
                "toAccountId": None,
                "title": title,
                "note": note or None,
                "createdBy": OWNER_UID,
                "createdAt": dt.isoformat(),
                "updatedAt": dt.isoformat(),
                "deletedAt": None,
                "source": "notion-import",
            })
        except Exception as e:  # noqa: BLE001 - collect, don't abort
            skipped.append((i, str(e)))

    ledger = {
        "id": LEDGER_ID, "name": LEDGER_NAME, "baseCurrency": BASE_CURRENCY,
        "members": {OWNER_UID: "owner"}, "createdBy": OWNER_UID,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    seed = {
        "ledger": ledger,
        "accounts": list(accounts.values()),
        "categories": list(categories.values()),
        "transactions": transactions,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)

    print(f"input:        {os.path.relpath(path)}")
    print(f"output:       {os.path.relpath(args.output)}")
    print(f"transactions: {len(transactions)}")
    print(f"accounts:     {len(accounts)} -> {[a['name'] for a in accounts.values()]}")
    print(f"categories:   {len(categories)}")
    print(f"skipped rows: {len(skipped)}")
    for ln, why in skipped[:10]:
        print(f"  line {ln}: {why}")


if __name__ == "__main__":
    main()
