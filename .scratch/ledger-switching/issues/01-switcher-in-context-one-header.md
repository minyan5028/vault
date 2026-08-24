# 01 — The Ledger switcher lives in context, and the header is one component

**What to build:** Nothing changes on screen. The Timeline still shows the Vault
mark and the active Ledger's name, still opens the same menu, still creates and
accepts Ledgers the same way. What changes is where that header comes from: a
single header component that every screen can render with no arguments, reading
the active Ledger, the Ledger list, the pending invitations and the select /
create / accept callbacks from a Ledger context provided once at the
authenticated-app level.

This is the prefactor. It exists so that the three tickets after it are small.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The Timeline header renders the shared header component and passes it
      nothing
- [x] The switcher takes no props; it reads what it needs from the Ledger
      context
- [x] The Ledger context is its own provider — the existing app-nav context
      (attention badge, logo target) is left alone and gains no Ledger fields
- [x] Selecting, creating and accepting a Ledger behave exactly as before,
      including the pending-Ledger optimism that shows a just-created Ledger
      before the live query catches up
- [x] The invitation dot still appears on the switcher when an invitation is
      pending
- [x] No interface strings are added, changed or removed
- [x] Typecheck and lint pass
