import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

    await setSessionCookie(data.sessionToken);

    return NextResponse.json({ user: data.user ?? null });
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Login failed" },
      { status: err.status || 500 },
    );
  }
}
