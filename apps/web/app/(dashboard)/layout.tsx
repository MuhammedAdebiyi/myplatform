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

  // apiFetchServer returns null on non-2xx; it can only throw on network
  // failure. redirect() also throws — keep it out of any catch-all or the
  // catch would swallow the verify-email redirect and force /login.
  let me: { id: string; emailVerified?: boolean } | null = null;
  try {
    me = await apiFetchServer("/users/me", token);
  } catch {
    me = null;
  }
  if (!me?.id) {
    redirect("/login");
  }
  // Email/password signups are gated until verified (frontend half of the
  // gate; the API half is EmailVerifiedGuard). OAuth users are born
  // verified and sail through.
  if (me.emailVerified === false) {
    redirect("/verify-email");
  }

  return <DashboardClient>{children}</DashboardClient>;
}
