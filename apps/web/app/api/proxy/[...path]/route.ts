import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, params);
}

async function proxy(
  req: NextRequest,
  paramsPromise: Promise<{ path: string[] }>,
) {
  const { path } = await paramsPromise;
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const apiPath = `/${path.join("/")}`;
  const searchParams = req.nextUrl.searchParams.toString();
  const url = searchParams ? `${apiPath}?${searchParams}` : apiPath;

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "DELETE") {
    body = await req.text();
  }

  try {
    const data = await apiFetch(url, {
      method: req.method,
      token,
      body,
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/json",
      },
    });

    if (data === null) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "API error" },
      { status: err.status || 500 },
    );
  }
}
