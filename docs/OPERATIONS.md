# Vault — Operations & Setup Guide

A practical runbook: how to develop, deploy, manage data, and stand up a brand
new project on your own. Written so you can maintain Vault without assistance.

---

## 1. How the pieces fit

Four separate things, each with one job:

| Thing | Holds | Where |
|-------|-------|-------|
| **Source code** | what you write | git (this repo, on your machine) |
| **Firebase Hosting** | the *built* web app (HTML/JS/CSS) | `https://vault-39af9.web.app` |
| **Cloud Firestore** | your *data* (transactions, accounts, categories) | Firebase project |
| **Firebase Auth** | sign-in (Google) | Firebase project |

```
 source code ──(npm run build)──► dist/ ──(firebase deploy)──► Hosting
                                                                   │
                                             phone/browser downloads the app
                                                                   │
                                              app talks to ──► Firestore (data)
                                                          └──► Auth (login)
```

Firestore never stores code; Hosting never stores data. Editing code and
deploying only changes the app; it does not touch your data.

---

## 2. Prerequisites

- **Node.js** and **npm** (`node -v`, `npm -v`).
- This repo, with dependencies installed: `npm install`.
- A `.env.local` file (see §3) with the Firebase web config.

---

## 3. Local development

```bash
npm install          # once, and after pulling dependency changes
npm run dev          # dev server at http://localhost:5173
npm test             # unit tests (money engine, i18n)
npm run typecheck    # TypeScript check
npm run build        # typecheck + production build into dist/
```

**Environment config** — the app reads Firebase settings from `.env.local`
(gitignored). Create it from `.env.example` and fill with your project's web
config (Firebase Console → Project settings → *Your apps* → Web app → SDK config):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These values are **not secret** (they identify the project; security comes from
Auth + Firestore rules). But Vite bakes them into the build at build time, so
**after changing `.env.local` you must rebuild** for the change to take effect.

### Developing on Windows

The stack is cross-platform; `npm install / dev / test / build` are identical.
A few OS-specific notes:

- **Bring the gitignored secrets over yourself** — they aren't in git:
  `.env.local` and `serviceAccountKey.json`. Transfer the service-account key
  securely (not email/public link); place both in the project root.
- **Line endings:** `.gitattributes` forces LF, so CRLF won't show up as spurious
  diffs. Leave Git's `core.autocrlf` at its default.
- **Deploy env var:** the Linux/macOS form
  `GOOGLE_APPLICATION_CREDENTIALS="$PWD/serviceAccountKey.json" npx firebase-tools deploy`
  does **not** work in PowerShell/CMD. Instead log in once and use the npm
  script (see §4, option A):
  ```
  npx firebase-tools login
  npm run deploy
  ```
  (If you must use the key non-interactively in PowerShell:
  `$env:GOOGLE_APPLICATION_CREDENTIALS="$PWD\serviceAccountKey.json"` then run
  the deploy command.)
- **Admin scripts** (`node scripts/*.mjs`) run the same; they need
  `serviceAccountKey.json` in the root.
- **Node version:** match what you use on macOS (currently v26). `sharp` (icon
  generation) has Windows prebuilds, so `npm install` handles it.

Moving to a new machine, in short: `git clone` → drop in `.env.local` +
`serviceAccountKey.json` → `npm install` → `npm run dev`; deploy via
`firebase login` + `npm run deploy`.

---

## 4. Changing code and pushing it live (deploy)

The loop is: **edit → verify → deploy.**

```bash
# 1. verify locally
npm test && npm run build

# 2. deploy the built app to Hosting
npm run deploy       # = npm run build + firebase deploy --only hosting
```

`firebase deploy` needs to authenticate to your Firebase project. Two ways:

- **A — interactive login (simplest for a person):**
  ```bash
  npx firebase-tools login      # opens a browser once; stays logged in
  npm run deploy
  ```
- **B — service account (no browser; used for automation):**
  ```bash
  GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json \
    npx firebase-tools deploy --only hosting --project vault-39af9
  ```

After deploy, the change is live at the Hosting URL. Users just refresh (the PWA
service worker also auto-updates on next load).

> The project is pinned in `.firebaserc` (`vault-39af9`). Hosting config
> (SPA rewrite, `dist/` as the web root) is in `firebase.json`.

---

## 5. Firestore security rules

Rules live in `firestore.rules` (version-controlled). They enforce
"only a ledger's members can read/write it" (see
`docs/ADR/0003-ledger-based-permissions.md`).

Publish a change either way:

- **Console:** Firestore Database → Rules → paste the file's contents → Publish.
- **CLI:** `npx firebase-tools deploy --only firestore:rules --project vault-39af9`

Test mode (open) is fine while developing a fresh project, but publish these
rules before storing real data.

---

## 6. Importing data (Notion → Firestore)

Two Python scripts convert Notion CSV exports into the Firestore shape, and one
Node script loads the result. All are idempotent by document id.

```bash
# 1. convert CSV exports (under data/) into JSON seeds
python3 scripts/migrate_notion.py             # expenses  → data/migrated/vault-seed.json
python3 scripts/migrate_income_transfers.py   # income+transfers → vault-income-transfers.json

# 2. load a JSON seed into your ledger (needs the Admin SDK key + your uid)
node scripts/load_seed.mjs <your-uid> serviceAccountKey.json data/migrated/vault-seed.json
node scripts/load_seed.mjs <your-uid> serviceAccountKey.json data/migrated/vault-income-transfers.json
```

- **Your uid:** Firebase Console → Authentication → Users → copy the UID.
  It is also the id of your personal ledger (`ledgers/{uid}`).
- The loader writes accounts, categories and transactions under `ledgers/{uid}`,
  remapping the placeholder `owner` to your uid and ISO dates to Timestamps.

---

## 7. Secrets & what is committed

| File | Secret? | In git? | Notes |
|------|---------|---------|-------|
| `.env.local` | No (identifiers) | **No** (gitignored) | keep it local; rebuild after edits |
| `serviceAccountKey.json` | **YES — admin key** | **No** (gitignored) | never commit/share; delete when unused |
| source, `docs/`, scripts | — | Yes | |
| `data/` CSV + seed JSON | contains your finances | Yes | fine locally; review before pushing to a public remote |

If you ever add a public GitHub remote, double-check `data/` — it holds your real
financial history.

---

## 8. Standing up a brand-new project from scratch

1. **Create a Firebase project** at <https://console.firebase.google.com/>.
2. **Firestore:** Build → Firestore Database → Create → *test mode*, location
   `asia-east1` (Taiwan; can't be changed later).
3. **Auth:** Build → Authentication → Get started → enable **Google**.
4. **Register a Web app** (`</>` icon) → copy the `firebaseConfig`.
5. **Configure the app:** copy `.env.example` → `.env.local`, fill from that config.
6. **Publish rules:** paste `firestore.rules` into the Rules tab → Publish.
7. **Run it:** `npm install`, `npm run dev`, sign in — a personal ledger is
   auto-created on first sign-in.
8. **(Optional) import data:** §6.
9. **Deploy:** `npx firebase-tools login`, set the project in `.firebaserc`
   (or `firebase use --add`), then `npm run deploy`.

That reproduces the entire live setup on a fresh project.

---

## 9. Common tasks

- **Ship a code change:** `npm run deploy`.
- **Point at a different Firebase project:** update `.firebaserc` (project id)
  and `.env.local` (web config), then rebuild/redeploy.
- **Use it on another device / account:** just open the URL and sign in — each
  user gets their own private ledger.
- **Add more historical data:** convert + `load_seed.mjs` (§6).

---

## 10. Troubleshooting

- **Google sign-in popup blocked** → allow popups for the site.
- **"Missing or insufficient permissions"** → the signed-in user isn't a member
  of that ledger, or rules weren't published. Check `ledgers/{uid}.members`.
- **A config change didn't take effect** → `.env.local` is baked at build time;
  rebuild (`npm run build` / `npm run deploy`).
- **Deploy: permission denied** → log in (`npx firebase-tools login`) or provide
  `GOOGLE_APPLICATION_CREDENTIALS`.
- **A brand-new month looked empty** → fixed; months now one-shot fetch on open.
  If a month is slow, it's just the server round-trip.
