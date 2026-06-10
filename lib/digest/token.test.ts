import { describe, it, expect } from "vitest";
import { digestSig, verifyDigestSig, unsubscribeUrl } from "./token";

const SECRET = "0123456789abcdef0123456789abcdef";
const UID = "9e107d9d-372b-4f6c-a541-2d1f6e1b8a3c";

describe("digestSig / verifyDigestSig", () => {
  it("round-trips a valid signature", () => {
    expect(verifyDigestSig(UID, digestSig(UID, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const sig = digestSig(UID, SECRET);
    const tampered = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyDigestSig(UID, tampered, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyDigestSig(UID, digestSig(UID, "other-secret"), SECRET)).toBe(false);
  });

  it("rejects a signature for a different user", () => {
    expect(verifyDigestSig("other-user", digestSig(UID, SECRET), SECRET)).toBe(false);
  });

  it("returns false (never throws) on malformed signatures", () => {
    expect(verifyDigestSig(UID, "", SECRET)).toBe(false);
    expect(verifyDigestSig(UID, "abc", SECRET)).toBe(false); // odd length / too short
    expect(verifyDigestSig(UID, "zz".repeat(32), SECRET)).toBe(false); // non-hex
    expect(verifyDigestSig(UID, digestSig(UID, SECRET).slice(0, 10), SECRET)).toBe(false);
    expect(verifyDigestSig("", digestSig(UID, SECRET), SECRET)).toBe(false);
    expect(verifyDigestSig(UID, digestSig(UID, SECRET), "")).toBe(false);
  });

  it("different users yield different signatures", () => {
    expect(digestSig("user-a", SECRET)).not.toBe(digestSig("user-b", SECRET));
  });
});

describe("unsubscribeUrl", () => {
  it("builds a verifiable link and tolerates a trailing slash on the site URL", () => {
    const url = unsubscribeUrl("https://example.com/", UID, SECRET);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/unsubscribe");
    expect(parsed.searchParams.get("uid")).toBe(UID);
    expect(verifyDigestSig(UID, parsed.searchParams.get("sig") ?? "", SECRET)).toBe(true);
  });
});
