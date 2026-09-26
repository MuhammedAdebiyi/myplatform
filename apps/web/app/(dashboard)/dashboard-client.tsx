"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AuthProvider, { useAuth } from "@/components/auth-provider";
import ThemeToggle from "@/components/theme-toggle";
import EmailVerifyBanner from "@/components/email-verify-banner";

const NAV_ITEMS = [
  {
    label: "Projects",
    href: "/projects",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
  },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);

  const orgParam = activeOrg ? `/${activeOrg.id}` : "";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)]">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
          <Link href="/projects" className="font-heading text-sm font-bold text-[var(--ink)]">
            myplatform
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--hover)] text-[var(--ink)]"
                    : "text-[var(--dim)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Org switcher at bottom */}
        {activeOrg && (
          <div className="border-t border-[var(--border)] p-3">
            <button
              onClick={() => setOrgOpen(!orgOpen)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--hover)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)] text-[10px] font-bold text-[var(--accent-contrast)]">
                {activeOrg.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate text-left">{activeOrg.name}</span>
              <svg className={`h-3.5 w-3.5 text-[var(--dim)] transition-transform ${orgOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {orgOpen && (
              <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setActiveOrg(org);
                      setOrgOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-[var(--hover)] ${
                      org.id === activeOrg.id ? "font-medium text-[var(--ink)]" : "text-[var(--dim)]"
                    }`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--bg-subtle)] text-[9px] font-bold">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                    {org.name}
                  </button>
                ))}
                <div className="my-1 border-t border-[var(--border)]" />
                <Link
                  href="/organizations/new"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--dim)] hover:bg-[var(--hover)]"
                  onClick={() => setOrgOpen(false)}
                >
                  + New organization
                </Link>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-6">
          <div className="text-sm text-[var(--dim)]">
            {activeOrg && (
              <span className="font-medium text-[var(--ink)]">{activeOrg.name}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--dim)]">{user.name || user.email}</span>
                <button
                  onClick={logout}
                  className="rounded-lg px-3 py-1.5 text-sm text-[var(--dim)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[920px] px-10 py-8">
            <EmailVerifyBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
