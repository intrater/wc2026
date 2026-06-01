import { describe, it, expect } from "vitest";
import { authMethodFor, safeNext } from "./flow";

describe("authMethodFor", () => {
  it("uses PKCE code exchange when a code is present (real email flow)", () => {
    expect(authMethodFor({ code: "abc", token_hash: null, type: null })).toBe("exchange");
    // code wins even if a token_hash is also somehow present
    expect(authMethodFor({ code: "abc", token_hash: "h", type: "magiclink" })).toBe("exchange");
  });
  it("verifies OTP when token_hash + type are present", () => {
    expect(authMethodFor({ code: null, token_hash: "h", type: "magiclink" })).toBe("verify");
  });
  it("errors when neither is present, or token_hash lacks a type", () => {
    expect(authMethodFor({ code: null, token_hash: null, type: null })).toBe("none");
    expect(authMethodFor({ code: null, token_hash: "h", type: null })).toBe("none");
  });
});

describe("safeNext", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNext("/pick")).toBe("/pick");
    expect(safeNext("/admin")).toBe("/admin");
  });
  it("rejects absolute URLs and protocol-relative open redirects", () => {
    expect(safeNext("https://evil.com")).toBe("/pick");
    expect(safeNext("//evil.com")).toBe("/pick");
    expect(safeNext(null)).toBe("/pick");
  });
});
