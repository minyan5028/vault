# Ledger switching, everywhere

Status: resolved

An experiment before a decision. Switching Ledgers is currently possible from
one screen only; this makes it possible from all four, cheaply and safely. What
that experiment is *for* — and how its result will be read — lives in
[notes.md](./notes.md), not here. This file says what to build and how it will
be judged done.

## Problem Statement

A Vault owner keeps a Personal Ledger and a shared Couple's Ledger. The
switcher that moves between them lives in the Timeline header and nowhere else.

So the owner cannot see which Ledger they are looking at while on Stats, Assets
or Settings, and cannot change it without first navigating back to Timeline.
Two consequences, one visible and one not:

- **Answering a question costs a detour.** "What did we spend this month?"
  needs Stats for one Ledger, then Timeline, then the switcher, then Stats
  again.
- **Settings can act on a Ledger it never names.** The Settings screen manages
  sharing, the catalog, and *deletion* — all scoped to the active Ledger — while
  its header reads only "Settings". The owner is one wrong assumption away from
  deleting the wrong Ledger.

Making switching frequent also exposes three faults that are dormant today
precisely because switching is rare:

1. The catalog hook does not clear when the Ledger changes, so the previous
   Ledger's Accounts, Categories and Projects stay on screen during the round
   trip. On Assets this renders the *previous* Ledger's account names next to a
   balance rollup that has already blanked — plausible-looking numbers that
   belong to no Ledger at all.
2. Screen-local state outlives the switch. A Stats drill-down holds a Category
   id from the Ledger you just left; so do the open Project, the selected
   Holding, and the Settings sub-page — including the one that deletes a Ledger.
3. Every switch forces a server round trip for data the local cache already
   holds, and re-runs the recurring catch-up.

## Solution

The Ledger name becomes the header on **all four** primary screens — same
position, same weight, always tappable to switch. Page identity moves entirely
to the bottom tab bar, which already carries an icon, a label and an active
colour for each destination.

Switching then means exactly one thing: *the screen you are on, for a different
Ledger*. It keeps you where you are, keeps what is still meaningful (the month
you were reading, the period, the view), and discards everything that belonged
to the Ledger you left rather than showing it against the new one.

And it gets cheaper: the catalog is served from the local cache instead of being
re-requested from the server on every switch, and the recurring catch-up runs
once per Ledger per session rather than once per switch.

## User Stories

1. As a Vault owner, I want to see which Ledger I am looking at on every screen,
   so that I never read one Ledger's numbers believing they are another's.
2. As a Vault owner, I want the Ledger name in the same place on every screen,
   so that I learn where to look once instead of four times.
3. As a Vault owner, I want to switch Ledger from Stats, so that I can compare
   the same month across my Personal and Couple's Ledgers without a detour.
4. As a Vault owner, I want to switch Ledger from Assets, so that I can read one
   Ledger's net worth and then the other's.
5. As a Vault owner, I want to switch Ledger from Settings, so that I can adjust
   the catalog of the Ledger I actually mean.
6. As a Vault owner, I want Settings to name the Ledger it is acting on, so that
   deleting a Ledger cannot target one I was not looking at.
7. As a Vault owner, I want switching to keep me on the screen I am already on,
   so that switching is a change of subject, not a change of place.
8. As a Vault owner, I want the month I was reading to survive a switch, so that
   comparing the same month across Ledgers takes one tap.
9. As a Vault owner, I want the period, view and mode I chose to survive a
   switch, so that the comparison is like for like.
10. As a Vault owner, I want a drill-down opened in one Ledger to close when I
    switch, so that I never see a heading naming a Category the current Ledger
    does not have.
11. As a Vault owner, I want an open Project view to close when I switch, so
    that a Project id from another Ledger cannot silently filter what I am
    shown.
12. As a Vault owner, I want a selected Holding to clear when I switch, so that
    I cannot act on a position that belongs to another Ledger.
13. As a Vault owner, I want an open Settings sub-page to close when I switch,
    so that a destructive action can never change target underneath me.
14. As a Vault owner, I want the screen to go briefly blank rather than show the
    previous Ledger's data, so that every number on screen is true of the Ledger
    named above it.
15. As a Vault owner, I want returning to a Ledger I looked at moments ago to be
    instant, so that comparing two Ledgers does not feel like loading an app
    twice.
16. As a Vault owner, I want switching not to spend my read quota on data the
    device already has, so that a habit of switching does not become a cost.
17. As a Vault owner, I want the recurring catch-up to run once per Ledger per
    session, so that navigating does not repeatedly ask the server about rules
    it has already settled.
18. As a Vault owner, I want creating a new Ledger to take me to its Timeline,
    so that I land where recording begins rather than on an empty chart.
19. As a Vault owner, I want accepting an invitation to leave me where I was, so
    that joining a Ledger does not throw away what I was doing.
20. As a Vault owner, I want the invitation dot to be visible from any screen,
    so that a pending invitation is not something only the Timeline knows about.
21. As a Vault owner, I want every new interface string to exist in both
    supported languages, so that switching language never reveals a gap.
22. As a Vault owner using a shared Ledger, I want the switcher to behave the
    same whether I own the Ledger or was invited to it, so that membership does
    not change how the app is navigated.

## Implementation Decisions

**A Ledger context replaces prop drilling.** The switcher currently takes six
props. Rather than passing those through four screens, the active Ledger, the
Ledger list, the pending invitations and the three callbacks (select, create,
accept) move into a dedicated React context provided at the authenticated-app
level. The switcher reads them itself and takes no props.

**The context is new, not an extension of the existing app-nav context.** The
app-nav context carries the attention badge and the logo target; its interface is
small and its meaning is navigation-and-notice. Ledger identity is a separate
concern and gets a separate provider, so neither becomes a junk drawer.

**One header component, used by all four screens.** Since the header is now
identical everywhere — the Vault mark, then the Ledger name as the switcher — it
becomes a single component rather than four copies. Each screen renders it with
no arguments. This makes header divergence impossible rather than merely
discouraged.

**The Ledger name replaces the page title.** Page identity is already carried by
the bottom tab bar (icon, label, active colour), so the title text is redundant.
The four title translation keys stay in use by the tab bar and are not removed.

**The switcher appears on the four primary screens only.** Account Detail,
Investments, Holding Detail and the Stats drill-down are the deep context of one
Ledger; switching there has no meaning and would only manufacture cross-Ledger
residue.

**The catalog hook adopts the shared live-query helper.** That helper already
guarantees the behaviour this feature needs: reset to the empty value the moment
the key changes, so switching Ledgers can never show the previous Ledger's data
during the round trip. Adopting it also removes the hook's one-shot server fetch,
because the helper takes a subscription only.

**Removing that fetch is deliberate, and it is the read-cost fix.** A one-shot
document read prefers the server when online; a subscription with the persistent
local cache serves what the device already has and reconciles afterwards. The
fetch is therefore both the duplicate read and the forced round trip. Its
presence is a habit carried over from a fix applied to the month-transactions
hook hours earlier the same day; the seven hooks written since the live-query
helper existed all subscribe without it and show no symptom.

**The month-transactions hook keeps its one-shot fetch.** It is the hook the
original fix was written for. Changing one thing at a time is the point; if the
catalog behaves after its fetch is removed, that is evidence, and the second hook
can be revisited on evidence rather than on analogy.

**Screen-local state is classified, not blanket-reset.** State that means the
same thing in any Ledger survives a switch: the month, the period, the view, the
income/expense mode. State that holds an identifier from a specific Ledger does
not: the Stats drill-down, the open Project, the selected Holding, the Settings
sub-page. Re-mounting each screen on Ledger change is rejected, because it would
also discard the month — and reading the same month in both Ledgers is the
comparison this feature exists to make cheap.

**The recurring catch-up becomes once-per-Ledger-per-session.** It is currently
bound to the active Ledger, so it re-runs on every switch. It is idempotent —
occurrences carry a deterministic id and the rule's next date is advanced — so
re-running is safe, merely wasteful. The session remembers which Ledgers it has
caught up and skips them. This is a truthfulness fix more than a cost fix: the
function documents itself as running on app open, and after this change that is
true.

**Creating a Ledger still jumps to the Timeline; accepting an invitation no
longer does.** A new Ledger is empty, so landing on Stats or Assets shows a
screen of zeros, while the Timeline is where recording starts. A Ledger you were
invited to already has a partner's events in it, so there is no reason to move
you off the screen you chose.

**Global subscriptions stay global.** The catalog and Holdings are subscribed
once for the whole app rather than per screen. Quick Entry can be opened from the
Timeline and from Account Detail and needs the full catalog immediately; the
endpoint index needs Accounts and Holdings together to name a trade's cash leg.
Per-screen subscription is rejected for now — the fetch removal above takes out
the larger waste, and this can be reconsidered against measurements rather than
guesses.

## Testing Decisions

**No new tests, and no new test seams.** This is stated as a decision, not an
omission.

A good test in this repo tests a decision expressed as a value: what the write
path will write, what one event does to the Projections, how a fold over the
trade log lands. All twelve test files are pure-function tests under `lib/` and
the write-planning module; the project has never had a component test and carries
no component-testing dependency. Every change in this spec is React wiring —
where a value lives, which component renders the header, which state is
discarded, when an effect fires. There is no decision here that can be expressed
as a value without first inventing a structure to hold it.

**The one candidate, and why it is declined.** "Which screen state survives a
Ledger switch" is a genuine decision, and its shape matches the existing
ledger-effect seam exactly: given before and after, return the pruned result. But
the three pieces of state live in three components with no shared shape, and
unifying them to make the decision testable is a larger change than the fix. It
is recorded in Out of Scope so the option survives this spec.

**What must not regress is covered by what already exists.** The i18n key-parity
test continues to guarantee both locales agree; no interface strings are added
(the switcher's strings already exist) and the four page-title keys remain in use
by the bottom tab bar, so nothing is orphaned. Type checking and lint cover the
context refactor, which is where a mechanical mistake would land.

**Verification is by hand, and the steps belong to the tickets.** Each ticket
carries the checks that prove it — switching from each screen, the absence of
residue, the blank-then-correct sequence, the catch-up firing once.

## Out of Scope

- **Cross-Ledger merged display.** Showing two Ledgers' data in one view is the
  question this experiment exists to answer, not something it delivers. The two
  parked decisions it would need — whether a shared Ledger's money counts in full
  or as a share, and whether merging spans two fixed Ledgers or every Ledger the
  owner belongs to — are recorded in notes.md with the reasoning as it stood.
- **A Ledger selector inside Quick Entry.** Recording into a Ledger other than
  the active one is a separate change, and one the experiment may show to be the
  real fix. It is not bundled here, so that its value can be judged on its own.
- **Extracting the switch-state decision into a testable pure function.**
  Declined above; recorded so the option is not lost.
- **Per-screen subscription of the catalog and Holdings.** Declined above,
  pending measurement.
- **Removing the month-transactions hook's one-shot fetch.** Deliberately held
  back so this spec changes one thing at a time.
- **Bounding the Stats year-plus-by-title read.** A year view genuinely needs a
  year of raw events, because titles are not carried by the rollups. It is
  listed in notes.md as something to watch, not something to change.
- **A dedicated ADR.** Nothing decided here is hard to reverse; that is the
  design. The decision that will deserve an ADR is the parked one about shared
  money, if and when it is taken.
- **Instrumentation.** The experiment is recorded by hand in notes.md. No
  counters ship.

## Further Notes

The header change has a second effect worth naming: once the Ledger name is the
title, "which Ledger am I in" stops being something the owner has to ask and
becomes something they cannot avoid seeing. That is the larger share of this
feature's value, and it is the reason the Ledger name takes the title's weight
rather than sitting beside it as a chip.

Ticket order matters. The context-and-header refactor lands first and changes no
behaviour, which makes the three behavioural tickets small and independently
reversible.
