import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }

  await setSessionCookie(token);
  return NextResponse.redirect(new URL("/projects", req.url));
}
