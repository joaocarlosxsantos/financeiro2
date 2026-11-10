import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { documentPolicy } from "@/lib/security-policy";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(32).toString("base64");
  const policy = documentPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  // Always overwrite client-supplied nonce/CSP headers before Next renders.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"],
};
