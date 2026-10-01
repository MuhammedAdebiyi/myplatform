"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

type Org = { id: string; name: string; slug: string; role: string };

export default function NewOrganizationPage() {
  const router = useRouter();
  const { refresh, setActiveOrg } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const slugify = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/proxy/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 409
            ? "That URL slug is already taken — try another."
            : data.message || "Something went wrong. Try again.",
        );
        return;
      }
      const org: Org = await res.json();
      setActiveOrg(org);
      await refresh();
      router.push("/projects");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[440px] py-10">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--dim)] transition-colors hover:text-[var(--ink)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to projects
      </Link>

      <h1 className="mt-6 font-heading text-2xl font-bold text-[var(--ink)]">New organization</h1>
      <p className="mt-1.5 text-sm text-[var(--dim)]">
        Organizations hold your projects, members, and API keys.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="org-name" className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
            Organization name
          </label>
          <input
            id="org-name"
            autoFocus
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Adebiyi Labs"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        <div>
          <label htmlFor="org-slug" className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
            URL slug
          </label>
          <div className="flex items-center gap-2">
            <input
              id="org-slug"
              required
              minLength={2}
              maxLength={100}
              pattern="[a-z0-9-]+"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="adebiyi-labs"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-mono text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--dim)]">
            Lowercase letters, numbers, and dashes. Used in URLs and the API.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-3 text-sm text-[var(--red)]">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={creating || name.trim().length < 2 || slug.length < 2}
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create organization"}
          </button>
          <Link
            href="/projects"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--dim)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
