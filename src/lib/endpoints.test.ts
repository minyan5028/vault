import { describe, it, expect } from "vitest";
import { endpointIndex, endpointName, resolveEndpoint } from "./endpoints";
import type { Account, Holding } from "../domain/types";

const account = (over: Partial<Account> = {}): Account => ({
  id: "cash",
  name: "Cash",
  type: "bank",
  currency: "TWD",
  openingBalance: 0,
  archived: false,
  sortOrder: 0,
  ...over,
});

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: "hold-1",
  ticker: "VT",
  name: "Vanguard Total World",
  class: "growth",
  currency: "USD",
  cost: 0,
  shares: 0,
  price: 0,
  pricedAt: null,
  realizedGain: 0,
  dividendReceived: 0,
  dividendPerShare: 0,
  targetPrice: null,
  buyDate: null,
  archived: false,
  sortOrder: 0,
  ...over,
});

describe("endpointIndex", () => {
  it("indexes accounts by id, naming them by account name", () => {
    const index = endpointIndex([account()], []);
    expect(index.get("cash")).toEqual({
      id: "cash",
      kind: "account",
      name: "Cash",
      currency: "TWD",
    });
  });

  it("indexes holdings by id, naming them by ticker", () => {
    const index = endpointIndex([], [holding()]);
    expect(index.get("hold-1")).toEqual({
      id: "hold-1",
      kind: "holding",
      name: "VT",
      currency: "USD",
    });
  });

  it("includes archived accounts and holdings — history still refers to them", () => {
    const index = endpointIndex(
      [account({ archived: true })],
      [holding({ archived: true })],
    );
    expect(index.size).toBe(2);
  });

  it("works with no holdings at all", () => {
    expect(endpointIndex([account()]).size).toBe(1);
  });
});

describe("resolveEndpoint", () => {
  const index = endpointIndex([account()], [holding()]);

  it("distinguishes an Account from a Holding", () => {
    expect(resolveEndpoint("cash", index)?.kind).toBe("account");
    expect(resolveEndpoint("hold-1", index)?.kind).toBe("holding");
  });

  it("is null for a null endpoint — income and expense have no destination", () => {
    expect(resolveEndpoint(null, index)).toBeNull();
  });

  it("is null for an id matching neither, rather than throwing", () => {
    expect(resolveEndpoint("deleted-holding", index)).toBeNull();
  });
});

describe("endpointName", () => {
  const index = endpointIndex([account()], [holding()]);

  it("names a trade's cash leg by its ticker, where an account lookup found nothing", () => {
    expect(endpointName("hold-1", index)).toBe("VT");
  });

  it("falls back to an empty string for an unresolvable endpoint", () => {
    expect(endpointName("gone", index)).toBe("");
  });

  it("uses a caller-supplied fallback when given one", () => {
    expect(endpointName("gone", index, "—")).toBe("—");
  });
});
