/**
 * Fetch current exchange rates into the base currency (TWD) from a free public
 * API, used to refresh net-worth valuation about weekly (client-triggered —
 * Vault has no backend). open.er-api.com is free, keyless and CORS-enabled.
 *
 * The API gives TWD → currency rates; we invert to currency → TWD (what
 * `meta/fx` stores). Only affects net-worth valuation, never historical
 * transactions (their fxRate is locked at entry, ADR-0002).
 */
const ENDPOINT = "https://open.er-api.com/v6/latest/TWD";
const TIMEOUT_MS = 5000;
const ATTEMPTS = 2;

/** One fetch attempt with a timeout (aborts a hung request). */
async function fetchRates(): Promise<Record<string, number>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`fx fetch failed: ${res.status}`);
    const data = await res.json();
    return (data?.rates ?? {}) as Record<string, number>;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRatesIntoTwd(
  currencies: string[],
): Promise<Record<string, number>> {
  if (currencies.length === 0) return {};
  let rates: Record<string, number> = {};
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      rates = await fetchRates();
      break;
    } catch (e) {
      if (attempt === ATTEMPTS) throw e; // give up after the last attempt
    }
  }
  const out: Record<string, number> = {};
  for (const c of currencies) {
    const twdToC = rates[c];
    if (typeof twdToC === "number" && twdToC > 0) {
      // Invert TWD→c to c→TWD, keep 4 decimals.
      out[c] = Math.round((1 / twdToC) * 10000) / 10000;
    }
  }
  return out;
}
