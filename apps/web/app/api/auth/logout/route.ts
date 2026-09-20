import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken, clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const token = await getSessionToken();

  if (token) {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        token,
      });
    } catch {
      // logout even if API call fails
    }
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
