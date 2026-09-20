"use client";

import { useAuth } from "@/components/auth-provider";
import { useEffect, useState, use } from "react";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt?: string;
  createdAt: string;
  revokedAt?: string;
};

export default function ApiKeysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrg } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const orgId = id;

  useEffect(() => {
    if (!activeOrg) return;
    fetch(`/api/proxy/organizations/${orgId}/api-keys`)
      .then((r) => r.json())
      .then((data) => {
        setKeys(data.items ?? data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeOrg, orgId]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedSecret(data.key ?? data.token ?? null);
        setKeys((prev) => [...prev, data.apiKey ?? data]);
        setShowCreate(false);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm("Revoke this key? It will stop working immediately.")) return;
    await fetch(`/api/proxy/organizations/${orgId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
  }

  if (loading) return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">API Keys</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
        >
          + Create key
        </button>
      </div>

      {/* Show secret once */}
      {createdSecret && (
        <div className="mt-4 rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/5 p-4">
          <p className="text-sm font-medium text-[var(--ink)]">API key created</p>
          <p className="mt-1 text-xs text-[var(--dim)]">Copy this now — it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--ink)] break-all">
              {createdSecret}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(createdSecret)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--ink)] hover:bg-[var(--hover)]"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setCreatedSecret(null)}
            className="mt-2 text-xs text-[var(--dim)] hover:text-[var(--ink)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={createKey} className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <label className="mb-1 block text-sm font-medium text-[var(--ink)]">Key name</label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder="my-api-key"
            />
            <button type="submit" disabled={creating || !newName.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50">
              Create
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-[var(--dim)] hover:text-[var(--ink)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 rounded-lg border border-[var(--border)]">
        {keys.map((key, i) => (
          <div key={key.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--ink)]">{key.name}</span>
                {key.revokedAt && (
                  <span className="rounded bg-[var(--failed)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--failed)]">revoked</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--dim)]">{key.keyPrefix}••••••••</span>
                {key.lastUsedAt && (
                  <span className="text-xs text-[var(--dim)]">last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            {!key.revokedAt && (
              <button
                onClick={() => revokeKey(key.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--dim)] hover:bg-[var(--hover)] hover:text-[var(--failed)]"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {keys.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--dim)]">No API keys.</div>
        )}
      </div>
    </div>
  );
}
