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

export async function fetchRatesIntoTwd(
  currencies: string[],
): Promise<Record<string, number>> {
  if (currencies.length === 0) return {};
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`fx fetch failed: ${res.status}`);
  const data = await res.json();
  const rates = (data?.rates ?? {}) as Record<string, number>;
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
