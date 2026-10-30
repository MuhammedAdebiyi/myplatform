"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const SECTIONS = [
  { label: "General", href: "/settings" },
  { label: "Members", href: "/settings/members" },
  { label: "API Keys", href: "/settings/api-keys" },
  { label: "Git", href: "/settings/github" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { activeOrg } = useAuth();

  function isActive(href: string) {
    if (href === "/settings") return pathname === "/settings";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">
          Settings
        </h1>
        {activeOrg && (
          <span className="text-sm text-[var(--dim)]">{activeOrg.name}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Manage your organization, access, and integrations.
      </p>

      <div className="mt-6 flex gap-8">
        <nav className="w-40 shrink-0">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(s.href)
                      ? "bg-[var(--hover)] text-[var(--ink)]"
                      : "text-[var(--dim)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
