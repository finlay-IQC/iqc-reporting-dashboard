import { describe, expect, it } from "vitest";
import { normaliseSupabaseUrl } from "./env";

describe("normaliseSupabaseUrl", () => {
  it.each([
    ["https://abc.supabase.co", "https://abc.supabase.co"],
    ["https://abc.supabase.co/", "https://abc.supabase.co"],
    ["https://abc.supabase.co/rest/v1/", "https://abc.supabase.co"],
    ["https://abc.supabase.co/rest/v1", "https://abc.supabase.co"],
    ["https://abc.supabase.co/auth/v1/", "https://abc.supabase.co"],
    [' "https://abc.supabase.co/rest/v1/"\n', "https://abc.supabase.co"],
    [undefined, ""],
  ])("%j → %s", (input, expected) => {
    expect(normaliseSupabaseUrl(input)).toBe(expected);
  });
});
