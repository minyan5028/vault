/**
 * The two accounts of a transfer, as the entry forms pick them.
 *
 * A transfer from an account to itself can't be saved, so neither the default
 * nor a pick may leave both sides naming the same account: picking the other
 * side's account swaps the two instead, which is also what the owner means
 * nine times out of ten ("no, the other way").
 */
export interface TransferPair {
  from: string;
  to: string;
}

/** Source: the preferred account when it is live, else the first live one.
 *  Destination: the first live account that isn't the source. Archived
 *  accounts are skipped — the forms show no chip for them, so a default
 *  landing on one would be a selection the owner can't see. */
export function defaultPair(
  accounts: readonly { id: string; archived: boolean }[],
  preferredFrom?: string,
): TransferPair {
  const live = accounts.filter((a) => !a.archived);
  const from = live.find((a) => a.id === preferredFrom)?.id ?? live[0]?.id ?? "";
  const to = live.find((a) => a.id !== from)?.id ?? from;
  return { from, to };
}

export function swap({ from, to }: TransferPair): TransferPair {
  return { from: to, to: from };
}

export function pickFrom(pair: TransferPair, id: string): TransferPair {
  return id === pair.to ? swap(pair) : { ...pair, from: id };
}

export function pickTo(pair: TransferPair, id: string): TransferPair {
  return id === pair.from ? swap(pair) : { ...pair, to: id };
}
