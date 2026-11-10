import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { documentPolicy } from "./security-policy";

describe("document security policy", () => {
  it("production authorizes nonce scripts, local fonts/images and same-origin connections", () => {
    const policy = documentPolicy("random-value", false);
    expect(policy).toContain("'nonce-random-value'");
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(policy).toContain("font-src 'self'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("frame-ancestors 'none'");
  });
  it("only development permits eval and HMR sockets", () => {
    expect(documentPolicy("dev", true)).toContain("'unsafe-eval'");
    expect(documentPolicy("dev", true)).toContain("ws: wss:");
  });
  it("replaces forged nonce headers, forwards policy to Next and never reuses a nonce", () => {
    const request = new NextRequest("https://example.test/login", { headers: { "x-nonce": "forged", "Content-Security-Policy": "script-src *" } });
    const first = proxy(request);
    const second = proxy(request);
    const policy = first.headers.get("Content-Security-Policy");
    expect(policy).not.toContain("forged");
    expect(policy).not.toBe(second.headers.get("Content-Security-Policy"));
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    const nonce = first.headers.get("x-middleware-request-x-nonce");
    expect(Buffer.from(nonce!, "base64")).toHaveLength(32);
    expect(policy).toContain(`'nonce-${nonce}'`);
  });
});
