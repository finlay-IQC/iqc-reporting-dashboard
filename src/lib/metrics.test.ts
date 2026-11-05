import { describe, expect, it } from "vitest";
import { change, groupTotals, normaliseRow, totals } from "./metrics";

const row = (o: Record<string, unknown>) =>
  normaliseRow({ date: "2026-11-01", client_id: "c1", segment_id: "s1", ...o });

describe("totals", () => {
  it("sums and derives ratios", () => {
    const t = totals([row({ spend: "100.50", crm_leads: 4, booked: 1, attributed_leads: 3 }), row({ spend: 99.5, crm_leads: 6, booked: 1, attributed_leads: 6 })]);
    expect(t.spend).toBe(200);
    expect(t.leads).toBe(10);
    expect(t.cpl).toBe(20);
    expect(t.cost_per_booking).toBe(100);
    expect(t.booking_rate).toBe(0.2);
    expect(t.attribution_rate).toBe(0.9);
  });
  it("returns null ratios with no denominator", () => {
    const t = totals([row({ spend: 50 })]);
    expect(t.cpl).toBeNull();
    expect(t.cost_per_booking).toBeNull();
  });
  it("has no cost per lead without spend", () => {
    expect(totals([row({ crm_leads: 5 })]).cpl).toBeNull();
  });
});

describe("groupTotals", () => {
  it("groups by key", () => {
    const g = groupTotals([row({ spend: 1 }), row({ spend: 2, segment_id: "s2" }), row({ spend: 3 })], (r) => r.segment_id);
    expect(g.get("s1")?.spend).toBe(4);
    expect(g.get("s2")?.spend).toBe(2);
  });
});

describe("change", () => {
  it("handles missing baselines", () => {
    expect(change(12, 10)).toBeCloseTo(0.2);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});
