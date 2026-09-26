import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth";
import { apiFetchServer } from "@/lib/api";

export async function GET() {
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const me = await apiFetchServer("/users/me", token);
    if (!me) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: me.id, name: me.name, email: me.email, emailVerified: me.emailVerified ?? false },
      organizations: me.organizations,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
