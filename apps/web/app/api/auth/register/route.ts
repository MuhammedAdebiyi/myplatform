import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });

    await setSessionCookie(data.sessionToken);

    return NextResponse.json({
      user: data.user,
      // false = NotificationHub send failed; UI must warn the user
      // their verification email may be delayed or missing.
      emailVerificationSent: data.emailVerificationSent ?? true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Registration failed" },
      { status: err.status || 500 },
    );
  }
}
