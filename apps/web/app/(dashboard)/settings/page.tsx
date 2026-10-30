"use client";

import { useAuth } from "@/components/auth-provider";
import { useState } from "react";

export default function GeneralSettingsPage() {
  const { activeOrg, setActiveOrg } = useAuth();
  // null = not edited yet; follows activeOrg.name until the user types.
  const [editedName, setEditedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = editedName ?? activeOrg?.name ?? "";

  if (!activeOrg) {
    return (
      <div className="py-12 text-center text-sm text-[var(--dim)]">
        Select an organization first.
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrg || name.trim().length < 2) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/organizations/${activeOrg.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Could not update the organization.");
        return;
      }
      const updated = await res.json().catch(() => null);
      setActiveOrg({ ...activeOrg, name: updated?.name ?? name.trim() });
      setEditedName(null);
      setSaved(true);
    } catch {
      setError("Could not update the organization. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-bold text-[var(--ink)]">
          General
        </h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Basic information about your organization.
        </p>
      </div>

      <form
        onSubmit={save}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-5"
      >
        <label className="mb-1 block text-sm font-medium text-[var(--ink)]">
          Organization name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setEditedName(e.target.value);
              setSaved(false);
            }}
            minLength={2}
            maxLength={100}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
          />
          <button
            type="submit"
            disabled={saving || name.trim() === activeOrg.name || name.trim().length < 2}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {saved && (
          <p className="mt-2 text-xs text-[var(--ok)]">Saved.</p>
        )}
        {error && (
          <p className="mt-2 text-xs text-[var(--red)]">{error}</p>
        )}
      </form>

      <div className="rounded-lg border border-[var(--border)]">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="text-sm font-medium text-[var(--ink)]">Slug</div>
            <div className="mt-0.5 text-xs text-[var(--dim)]">
              Permanent identifier used in URLs and API calls.
            </div>
          </div>
          <code className="rounded bg-[var(--hover)] px-2 py-1 font-mono text-xs text-[var(--ink)]">
            {activeOrg.slug}
          </code>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4">
          <div>
            <div className="text-sm font-medium text-[var(--ink)]">Organization ID</div>
            <div className="mt-0.5 text-xs text-[var(--dim)]">
              Used when calling the API directly.
            </div>
          </div>
          <code className="rounded bg-[var(--hover)] px-2 py-1 font-mono text-xs text-[var(--ink)]">
            {activeOrg.id}
          </code>
        </div>
      </div>
    </div>
  );
}
