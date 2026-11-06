import { describe, expect, it } from "vitest";
import { dateChunks, insightToRows, metaLeadCount, normaliseAccountId } from "./parse";

describe("metaLeadCount", () => {
  it("prefers Meta's combined lead total", () => {
    expect(metaLeadCount([
      { action_type: "link_click", value: "40" },
      { action_type: "lead", value: "7" },
      { action_type: "onsite_conversion.lead_grouped", value: "5" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
    ])).toBe(7);
  });
  it("falls back to form + pixel leads", () => {
    expect(metaLeadCount([{ action_type: "onsite_conversion.lead_grouped", value: "5" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }])).toBe(7);
    expect(metaLeadCount(undefined)).toBe(0);
  });
});

describe("normaliseAccountId", () => {
  it("accepts with or without act_", () => {
    expect(normaliseAccountId("123456789")).toBe("act_123456789");
    expect(normaliseAccountId(" act_123456789 ")).toBe("act_123456789");
    expect(normaliseAccountId("ACT_123456789")).toBe("act_123456789");
  });
  it("rejects junk", () => {
    expect(normaliseAccountId("my account")).toBeNull();
    expect(normaliseAccountId("")).toBeNull();
  });
});

describe("insightToRows", () => {
  it("maps an ad-level daily row", () => {
    const { insight, campaign, adset, ad } = insightToRows("act_1", {
      date_start: "2026-11-01", campaign_id: "c1", campaign_name: "IQC | Leads", adset_id: "s1", adset_name: "Broad",
      ad_id: "a1", ad_name: "Video", spend: "12.345", impressions: "1000", reach: "800", clicks: "30", inline_link_clicks: "20",
      actions: [{ action_type: "lead", value: "2" }],
    });
    expect(insight).toEqual({ ad_id: "a1", date: "2026-11-01", ad_account_id: "act_1", campaign_id: "c1", adset_id: "s1", spend: 12.35, impressions: 1000, reach: 800, clicks: 30, link_clicks: 20, leads: 2 });
    expect(campaign).toEqual({ id: "c1", ad_account_id: "act_1", name: "IQC | Leads" });
    expect(adset?.name).toBe("Broad");
    expect(ad.adset_id).toBe("s1");
  });
});

describe("dateChunks", () => {
  it("splits inclusive ranges", () => {
    expect(dateChunks("2026-01-01", "2026-03-01", 30)).toEqual([
      { since: "2026-01-01", until: "2026-01-30" },
      { since: "2026-01-31", until: "2026-03-01" },
    ]);
    expect(dateChunks("2026-01-05", "2026-01-05")).toEqual([{ since: "2026-01-05", until: "2026-01-05" }]);
  });
});
