import { describe, it, expect } from "vitest";
import { defaultPair, pickFrom, pickTo, swap } from "./transferPair";

const acct = (id: string, archived = false) => ({ id, archived });
const accounts = [acct("cash"), acct("bank"), acct("usd")];

describe("defaultPair", () => {
  it("starts from the first account and sends to the next one", () => {
    expect(defaultPair(accounts)).toEqual({ from: "cash", to: "bank" });
  });

  it("never sends to the account it starts from, whichever one that is", () => {
    // Opened from the second account's detail page: the old default named it twice.
    expect(defaultPair(accounts, "bank")).toEqual({ from: "bank", to: "cash" });
  });

  it("skips archived accounts — they have no chip to show the selection on", () => {
    const list = [acct("old", true), acct("cash"), acct("gone", true), acct("bank")];
    expect(defaultPair(list)).toEqual({ from: "cash", to: "bank" });
  });

  it("ignores a preferred source that is archived or unknown", () => {
    expect(defaultPair([acct("old", true), ...accounts], "old")).toEqual({ from: "cash", to: "bank" });
    expect(defaultPair(accounts, "nope")).toEqual({ from: "cash", to: "bank" });
  });

  it("falls back to the same account, or nothing, when there is no second one", () => {
    expect(defaultPair([acct("cash")])).toEqual({ from: "cash", to: "cash" });
    expect(defaultPair([])).toEqual({ from: "", to: "" });
  });
});

describe("picking a side", () => {
  const pair = { from: "cash", to: "bank" };

  it("just moves the side picked when it doesn't collide", () => {
    expect(pickFrom(pair, "usd")).toEqual({ from: "usd", to: "bank" });
    expect(pickTo(pair, "usd")).toEqual({ from: "cash", to: "usd" });
  });

  it("swaps the two when the source is set to the destination", () => {
    expect(pickFrom(pair, "bank")).toEqual({ from: "bank", to: "cash" });
  });

  it("swaps the two when the destination is set to the source", () => {
    expect(pickTo(pair, "cash")).toEqual({ from: "bank", to: "cash" });
  });

  it("swap flips the direction", () => {
    expect(swap(pair)).toEqual({ from: "bank", to: "cash" });
  });
});
