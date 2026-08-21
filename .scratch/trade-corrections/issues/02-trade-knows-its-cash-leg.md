# 02 — A trade knows its cash leg

**What to build:** A trade records the id of the transfer that paid for it.

`tradeDocData` writes no link today, so nothing connects a trade to its cash leg.
`holdingRepo.remove` recovers legs by querying every transaction whose endpoint
is the holding — enough to tear the whole position down, useless for finding the
one leg belonging to one trade. Without the link, editing a trade cannot keep the
money in step.

New trades store `transferId` (or null, for a trade recorded with no cash leg). A
backfill script pairs existing trades with their legs by matching on holding,
date and amount, following the `--commit`/dry-run convention the repo's other
sixteen scripts use.

Some legacy pairs will be ambiguous — several trades of the same holding, same
day, same amount. Those trades stay editable; they show that their cash leg is
not linked, and editing them leaves the transfer alone. Refusing to edit them
would leave the owner stuck on exactly the trades most likely to be wrong.

**Blocked by:** nothing.

**Status:** ready-for-agent

- [ ] A buy or sell recorded with a cash account stores that transfer's id on the
      trade
- [ ] A trade recorded without a cash leg stores null, distinguishably from a
      legacy trade whose link is unknown
- [ ] The backfill matches unambiguous legacy trades to their legs and reports
      every ambiguous one by name in the dry run
- [ ] The dry run writes nothing and prints the exact command to commit
- [ ] `holdingRepo.remove` still tears down a whole holding correctly, including
      trades whose link is unknown
- [ ] The write-plan tests cover a trade with a leg, without a leg, and with an
      unknown link
