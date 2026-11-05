import { describe, expect, it } from "vitest";
import { resolveRange } from "./dates";

describe("resolveRange", () => {
  it("builds complete-day windows ending yesterday (London)", () => {
    const r = resolveRange("7d", new Date("2026-11-05T12:00:00Z"));
    expect(r).toMatchObject({ key: "7d", from: "2026-10-29", to: "2026-11-04", prevFrom: "2026-10-22", prevTo: "2026-10-28" });
  });
  it("uses London date around midnight in BST", () => {
    // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in London
    expect(resolveRange("7d", new Date("2026-06-30T23:30:00Z")).to).toBe("2026-06-30");
  });
  it("defaults to 30d for unknown input", () => {
    expect(resolveRange("bogus").key).toBe("30d");
    expect(resolveRange(undefined).days).toBe(30);
  });
});

import { londonStartOfDay } from "./dates";
describe("londonStartOfDay", () => {
  it("is midnight UTC in winter and 23:00 previous day in summer", () => {
    expect(londonStartOfDay("2026-01-15")).toBe("2026-01-15T00:00:00.000Z");
    expect(londonStartOfDay("2026-07-15")).toBe("2026-07-14T23:00:00.000Z");
    expect(londonStartOfDay("2026-10-25")).toBe("2026-10-24T23:00:00.000Z"); // clocks go back this day
  });
});
