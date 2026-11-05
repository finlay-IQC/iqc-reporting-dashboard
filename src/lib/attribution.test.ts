import { describe, expect, it } from "vitest";
import { classifyChannel, mergeUtms, metaIdsFromUtms, parseLandingUrl } from "./attribution";

describe("parseLandingUrl", () => {
  it("extracts utms and fbclid", () => {
    const u = parseLandingUrl(
      "https://example.com/quote?utm_source=facebook&utm_medium=paid_social&utm_campaign=120211&utm_term=120212&utm_content=120213&fbclid=abc",
    );
    expect(u).toEqual({
      utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "120211",
      utm_content: "120213", utm_term: "120212", fbclid: "abc",
    });
  });
  it("treats unfilled Meta macros as missing", () => {
    expect(parseLandingUrl("https://x.com/?utm_content={{ad.id}}").utm_content).toBeNull();
  });
  it("survives junk", () => {
    expect(parseLandingUrl("not a url %%%").utm_source).toBeNull();
    expect(parseLandingUrl(null).fbclid).toBeNull();
  });
});

describe("mergeUtms", () => {
  it("prefers explicit CRM fields over the URL", () => {
    const merged = mergeUtms({ utm_campaign: "Explicit" }, parseLandingUrl("https://x.com/?utm_campaign=FromUrl&utm_source=fb"));
    expect(merged.utm_campaign).toBe("Explicit");
    expect(merged.utm_source).toBe("fb");
  });
});

describe("metaIdsFromUtms", () => {
  it("only accepts numeric IDs", () => {
    const ids = metaIdsFromUtms(parseLandingUrl("https://x.com/?utm_campaign=Spring%20Sale&utm_term=23851234567&utm_content=23859876543"));
    expect(ids).toEqual({ campaign: null, adset: "23851234567", ad: "23859876543" });
  });
});

describe("classifyChannel", () => {
  const none = parseLandingUrl(null);
  it("lead form wins", () => {
    expect(classifyChannel({ hasMetaFormId: true, utms: none })).toBe("meta_form");
    expect(classifyChannel({ hasMetaFormId: false, utms: none, crmSource: "Facebook Lead Form" })).toBe("meta_form");
  });
  it("meta landing page via utm_source or fbclid", () => {
    expect(classifyChannel({ hasMetaFormId: false, utms: parseLandingUrl("https://x.com/?utm_source=ig") })).toBe("meta_landing_page");
    expect(classifyChannel({ hasMetaFormId: false, utms: parseLandingUrl("https://x.com/?fbclid=1") })).toBe("meta_landing_page");
  });
  it("other paid, organic, unknown", () => {
    expect(classifyChannel({ hasMetaFormId: false, utms: parseLandingUrl("https://x.com/?utm_source=google&utm_medium=cpc") })).toBe("other_paid");
    expect(classifyChannel({ hasMetaFormId: false, utms: none, crmSource: "Website" })).toBe("organic");
    expect(classifyChannel({ hasMetaFormId: false, utms: none })).toBe("unknown");
  });
});
