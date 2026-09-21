import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth";
import { apiFetchServer } from "@/lib/api";

export async function GET() {
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const data = await apiFetchServer("/users/me/sessions", token);
    if (data) {
      return NextResponse.json({ authenticated: true });
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
