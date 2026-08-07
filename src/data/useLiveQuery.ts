import { useEffect, useRef, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";

/**
 * Hold the latest value of one live Firestore query.
 *
 * Every live view in Vault wants the same four things, and getting any of them
 * wrong is a real bug rather than untidiness:
 *
 *  - subscribe while `key` is non-empty, and to nothing at all while it is
 *    blank (there is no ledger yet during sign-in / provisioning);
 *  - **reset to `initial` the moment `key` changes**, so switching ledgers can
 *    never show the previous ledger's data during the round trip;
 *  - unsubscribe on unmount and before re-subscribing;
 *  - never re-subscribe just because the caller passed a fresh closure.
 *
 * `key` is the identity of the query — the ledger id, or it joined with
 * whatever else scopes it. `subscribe` may close over anything: it is read
 * through a ref, so an inline arrow doesn't churn the subscription.
 */
export function useLiveQuery<T>(
  key: string,
  initial: T,
  subscribe: (emit: (value: T) => void) => Unsubscribe,
): T {
  const [value, setValue] = useState<T>(initial);

  // Keep the newest closure without making it a dependency of the
  // subscription. This effect is declared first, so it has already run by the
  // time the subscription below re-runs for a new key.
  const latest = useRef(subscribe);
  useEffect(() => {
    latest.current = subscribe;
  });

  const blank = useRef(initial);
  useEffect(() => {
    setValue(blank.current);
    if (!key) return;
    return latest.current(setValue);
  }, [key]);

  return value;
}
