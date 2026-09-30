import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

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

// KR-004: the API's OAuth callback hands the browser a ONE-TIME code, not a
// session token. This route exchanges the code server-to-server, so the real
// session token never appears in any URL (history, proxy logs, Referer).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const redirectTo = safeRedirectTarget(
    req.nextUrl.searchParams.get("redirect_to"),
    req.url,
  );

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }

  let sessionToken: string | null = null;
  try {
    const res = await fetch(`${API_BASE}/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { sessionToken?: string };
      sessionToken = data.sessionToken ?? null;
    }
  } catch {
    sessionToken = null;
  }

  if (!sessionToken) {
    // Invalid/expired/replayed code — fail closed to login with an error.
    return NextResponse.redirect(
      new URL("/login?error=oauth_exchange_failed", req.url),
    );
  }

  await setSessionCookie(sessionToken);
  return NextResponse.redirect(new URL(redirectTo, req.url));
}
