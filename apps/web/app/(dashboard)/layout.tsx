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

  try {
    const me = await apiFetchServer("/users/me", token);
    if (!me?.id) {
      redirect("/login");
    }
  } catch {
    redirect("/login");
  }

  return <DashboardClient>{children}</DashboardClient>;
}
