import { describe, expect, it } from "vitest";
import { suggestLifecycle } from "./stages";

describe("suggestLifecycle", () => {
  it.each([
    ["New Lead", "new"],
    ["Contacted", "contacted"],
    ["Follow Up 2", "contacted"],
    ["Qualified", "qualified"],
    ["Not Qualified", "unqualified"],
    ["Unqualified", "unqualified"],
    ["Appointment Booked", "booked"],
    ["Consultation Scheduled", "booked"],
    ["Showed", "showed"],
    ["No Show", "lost"],
    ["Quote Sent", "showed"],
    ["Closed Won", "won"],
    ["Deposit Paid", "won"],
    ["Lost", "lost"],
    ["Closed Lost", "lost"],
    ["Stage 7", null],
  ])("%s → %s", (name, expected) => {
    expect(suggestLifecycle(name)).toBe(expected);
  });
});
