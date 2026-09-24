import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";

function safeRedirectTarget(raw: string | null, requestUrl: string): string {
  if (!raw) return "/projects";
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
    const target = new URL(raw, requestUrl);
    const base = new URL(requestUrl);
    if (target.origin === base.origin) return `${target.pathname}${target.search}`;
    return "/projects";
  } catch {
    return "/projects";
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const redirectTo = safeRedirectTarget(
    req.nextUrl.searchParams.get("redirect_to"),
    req.url,
  );

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }

  await setSessionCookie(token);
  return NextResponse.redirect(new URL(redirectTo, req.url));
}
