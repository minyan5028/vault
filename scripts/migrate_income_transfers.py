#!/usr/bin/env python3
"""
Convert the Notion Incomes + Transfers CSV exports into Vault transactions,
appended to the existing Firestore data (expenses were loaded separately).

Output: data/migrated/vault-income-transfers.json with the 4 new accounts the
transfers introduce and the income/transfer transactions. Load it with
scripts/load_seed.mjs. See docs/DATA_MODEL.md.
"""
from __future__ import annotations
import csv, glob, json, os, re, uuid, hashlib
from datetime import datetime, timezone, timedelta

BASE_CURRENCY = "TWD"
OWNER_UID = "owner"           # loader remaps to the real uid
TZ = timezone(timedelta(hours=8))
MINOR_SCALE = 100
ORIGINAL_ACCOUNTS = {"general", "dream", "fixed", "couple-s", "savings", "investment"}


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return s or ("x-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:8])


def strip_link(v: str | None) -> str:
    return re.sub(r"\s*\(https://[^)]*\)", "", v or "").strip()


def to_minor(amount_str: str) -> int | None:
    raw = (amount_str or "").replace("NT$", "").replace("$", "").replace(",", "").strip()
    if not raw:
        return None
    from decimal import Decimal
    try:
        return int((Decimal(raw) * MINOR_SCALE).to_integral_value())
    except Exception:
        return None


def parse_date(v: str) -> datetime | None:
    v = re.sub(r"\s*\(GMT[^)]*\)\s*$", "", (v or "")).strip()
    for fmt in ("%Y/%m/%d %I:%M %p", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).replace(tzinfo=TZ)
        except ValueError:
            continue
    return None


def find(name: str) -> str:
    hits = glob.glob(
        os.path.join(os.path.dirname(__file__), "..", "data", "**", f"{name}*_all.csv"),
        recursive=True,
    )
    if not hits:
        raise SystemExit(f"No {name}*_all.csv found under data/")
    return hits[0]


def txn(**kw) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "currency": BASE_CURRENCY,
        "baseCurrency": BASE_CURRENCY,
        "fxRate": 1.0,
        "categoryId": None,
        "toAccountId": None,
        "note": None,
        "createdBy": OWNER_UID,
        "deletedAt": None,
        "source": "notion-import",
    }
    base.update(kw)
    return base


def main() -> None:
    transactions: list[dict] = []
    accounts_seen: set[str] = set()
    skipped = 0

    # --- Incomes ---
    for r in csv.DictReader(open(find("Incomes"), encoding="utf-8-sig")):
        amount = to_minor(r.get("Amount"))
        acc = strip_link(r.get("Accounts"))
        dt = parse_date(r.get("Date"))
        if amount is None or not acc or dt is None:
            skipped += 1
            continue
        acc_id = slug(acc)
        accounts_seen.add(acc_id)
        transactions.append(txn(
            type="income", amount=amount, baseAmount=amount,
            date=dt.isoformat(), yearMonth=dt.strftime("%Y-%m"),
            accountId=acc_id, title=(r.get("Income") or "").strip(),
            note=(r.get("Detail") or "").strip() or None,
            createdAt=dt.isoformat(), updatedAt=dt.isoformat(),
        ))

    # --- Transfers ---
    for r in csv.DictReader(open(find("Transfers"), encoding="utf-8-sig")):
        amount = to_minor(r.get("Amount"))
        frm = strip_link(r.get("From Account"))
        to = strip_link(r.get("To Account"))
        dt = parse_date(r.get("Date"))
        if amount is None or not frm or not to or dt is None:
            skipped += 1
            continue
        from_id, to_id = slug(frm), slug(to)
        accounts_seen.update([from_id, to_id])
        transactions.append(txn(
            type="transfer", amount=amount, baseAmount=amount,
            date=dt.isoformat(), yearMonth=dt.strftime("%Y-%m"),
            accountId=from_id, toAccountId=to_id,
            title=(r.get("Transactions") or "").strip(),
            note=(r.get("Detail") or "").strip() or None,
            createdAt=dt.isoformat(), updatedAt=dt.isoformat(),
        ))

    # New accounts introduced by this data (originals already exist in Firestore).
    new_ids = sorted(accounts_seen - ORIGINAL_ACCOUNTS)
    # Re-derive display names from the raw slugs → Title Case words.
    def title_of(acc_id: str) -> str:
        return " ".join(w.upper() if w in ("us", "nt", "jpy") else w.capitalize()
                        for w in acc_id.split("-"))
    accounts = [
        {"id": aid, "name": title_of(aid), "type": "other",
         "currency": BASE_CURRENCY, "archived": False, "sortOrder": 6 + i}
        for i, aid in enumerate(new_ids)
    ]

    out = os.path.join(os.path.dirname(__file__), "..", "data", "migrated",
                       "vault-income-transfers.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"accounts": accounts, "categories": [], "transactions": transactions},
                  f, ensure_ascii=False, indent=2)

    print(f"output:       {os.path.relpath(out)}")
    print(f"transactions: {len(transactions)} (income+transfer)")
    print(f"skipped:      {skipped}")
    print(f"new accounts: {[a['name'] for a in accounts]}")


if __name__ == "__main__":
    main()
