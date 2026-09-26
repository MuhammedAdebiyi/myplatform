import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

type ApiFailure = { status?: number; message?: string };

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const data = await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (err) {
    const e = err as ApiFailure;
    return NextResponse.json(
      { message: e.message || "Request failed" },
      { status: e.status || 500 },
    );
  }
}
