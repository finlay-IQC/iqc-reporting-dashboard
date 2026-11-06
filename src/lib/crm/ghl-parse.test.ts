import { describe, expect, it } from "vitest";
import { contactToLead, latestByContact, opportunityLifecycle, parseOpportunity, type StageLookup } from "./ghl-parse";

const stages: StageLookup = new Map([["st-booked", { pipeline_name: "Sales", stage_name: "Appointment Booked" }]]);

describe("contactToLead", () => {
  it("reads a landing-page lead with Meta IDs in the UTMs", () => {
    const lead = contactToLead("client-1", {
      id: "c1", firstName: "Amelia", lastName: "Smith", email: "a@example.com", phone: "+447700900123",
      source: "Kitchen quote funnel", dateAdded: "2026-11-01T10:00:00.000Z", dateUpdated: "2026-11-02T10:00:00.000Z",
      attributionSource: {
        url: "https://quotes.example.com/kitchens?utm_source=facebook&utm_medium=paid_social&utm_campaign=120200000000001&utm_term=120200000000002&utm_content=120200000000003&fbclid=IwAR1",
        sessionSource: "Paid Social",
      },
    }, undefined, stages)!;
    expect(lead).toMatchObject({
      client_id: "client-1", crm_provider: "ghl", crm_id: "c1", first_name: "Amelia", email: "a@example.com",
      channel: "meta_landing_page", utm_source: "facebook", fbclid: "IwAR1",
      meta_campaign_id: "120200000000001", meta_adset_id: "120200000000002", meta_ad_id: "120200000000003",
      stage_name: null, crm_created_at: "2026-11-01T10:00:00.000Z",
    });
  });

  it("reads explicit utm fields and a Facebook lead form", () => {
    const lead = contactToLead("client-1", {
      id: "c2", dateAdded: "2026-11-01T10:00:00Z", source: "facebook lead ads",
      attributions: [
        { isFirst: true, utmCampaign: "IQC | Leeds | Leads", adId: "120200000000009", fbFormId: "987654321012345", medium: "facebook" },
        { isLast: true, utmSource: "google" },
      ],
    }, { id: "o1", contactId: "c2", pipelineId: "p1", pipelineStageId: "st-booked", status: "open", monetaryValue: 2500, updatedAt: null }, stages)!;
    expect(lead).toMatchObject({
      channel: "meta_form", utm_campaign: "IQC | Leeds | Leads", meta_ad_id: "120200000000009", meta_form_id: "987654321012345",
      meta_campaign_id: null, pipeline_name: "Sales", stage_name: "Appointment Booked", lifecycle_hint: null, value: 2500,
    });
  });

  it("ignores GHL's own (non-numeric) form IDs and unfilled macros", () => {
    const lead = contactToLead("x", {
      id: "c3", dateAdded: "2026-11-01T10:00:00Z",
      attributionSource: { formId: "aBcD1234efGH", url: "https://x.com/?utm_content={{ad.id}}" },
    }, undefined, stages)!;
    expect(lead.meta_form_id).toBeNull();
    expect(lead.meta_ad_id).toBeNull();
    expect(lead.channel).toBe("unknown");
  });

  it("skips records without an id or created date", () => {
    expect(contactToLead("x", { id: "c4" }, undefined, stages)).toBeNull();
    expect(contactToLead("x", null, undefined, stages)).toBeNull();
  });
});

describe("opportunities", () => {
  it("parses and keeps the latest per contact", () => {
    const a = parseOpportunity({ id: "o1", contact: { id: "c1" }, pipelineStageId: "s1", status: "open", monetaryValue: 0, updatedAt: "2026-10-01T00:00:00Z" })!;
    const b = parseOpportunity({ id: "o2", contactId: "c1", pipelineStageId: "s2", status: "won", monetaryValue: 900, updatedAt: "2026-11-01T00:00:00Z" })!;
    expect(a.monetaryValue).toBeNull();
    expect(latestByContact([a, b]).get("c1")?.id).toBe("o2");
    expect(parseOpportunity({ id: "o3" })).toBeNull();
  });
  it("maps statuses", () => {
    expect(opportunityLifecycle("won")).toBe("won");
    expect(opportunityLifecycle("abandoned")).toBe("lost");
    expect(opportunityLifecycle("open")).toBeNull();
  });
});
