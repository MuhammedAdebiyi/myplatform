import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/auth";
import { apiFetchServer } from "@/lib/api";
import DashboardClient from "@/app/(dashboard)/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getSessionToken();

  if (!token) {
    redirect("/login");
  }

  let authenticated = false;

  try {
    const me = await apiFetchServer("/auth/me", token);
    authenticated = !!me?.authenticated;
  } catch {
    authenticated = false;
  }

  if (!authenticated) {
    redirect("/login");
  }

  return <DashboardClient>{children}</DashboardClient>;
}
