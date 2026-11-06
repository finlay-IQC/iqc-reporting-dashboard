import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const load = () => import("./crypto");

describe("crypto", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = "test-key-that-is-definitely-long-enough-123";
  });

  it("round-trips and uses a fresh IV each time", async () => {
    const { encryptSecret, decryptSecret } = await load();
    const a = encryptSecret("pit-abc123");
    const b = encryptSecret("pit-abc123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("pit-abc123");
    expect(decryptSecret(a)).toBe("pit-abc123");
  });

  it("fails clearly with the wrong key", async () => {
    const { encryptSecret } = await load();
    const enc = encryptSecret("secret");
    process.env.TOKEN_ENCRYPTION_KEY = "a-different-key-that-is-also-long-enough-xyz";
    const { decryptSecret } = await load();
    expect(() => decryptSecret(enc)).toThrow(/re-enter the token/);
  });

  it("rejects a short key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = "short";
    const { encryptSecret } = await load();
    expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("verifies webhook keys per client", async () => {
    const { webhookKey, verifyWebhookKey } = await load();
    const k = webhookKey("client-1");
    expect(verifyWebhookKey("client-1", k)).toBe(true);
    expect(verifyWebhookKey("client-2", k)).toBe(false);
    expect(verifyWebhookKey("client-1", null)).toBe(false);
    expect(verifyWebhookKey("client-1", "nope")).toBe(false);
  });
});
