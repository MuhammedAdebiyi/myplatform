"use client";

import { useAuth } from "@/components/auth-provider";
import { useEffect, useState, use } from "react";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
  createdAt: string;
};

const ROLES = ["OWNER", "ADMIN", "DEVELOPER", "MEMBER", "VIEWER"] as const;

export default function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrg, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);

  const orgId = id;

  useEffect(() => {
    if (!activeOrg) return;
    fetch(`/api/proxy/organizations/${orgId}/members`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.items ?? data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeOrg, orgId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        const member = await res.json();
        setMembers((prev) => [...prev, member]);
        setShowInvite(false);
        setInviteEmail("");
      }
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member?")) return;
    await fetch(`/api/proxy/organizations/${orgId}/members/${userId}`, {
      method: "DELETE",
    });
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  if (loading) return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">Members</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
        >
          + Invite member
        </button>
      </div>

      {showInvite && (
        <form onSubmit={invite} className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <div className="flex gap-2">
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder="email@example.com"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button type="submit" disabled={inviting || !inviteEmail.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50">
              Send
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className="px-3 py-2 text-sm text-[var(--dim)] hover:text-[var(--ink)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 rounded-lg border border-[var(--border)]">
        {members.map((m, i) => (
          <div key={m.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
            <div>
              <div className="text-sm font-medium text-[var(--ink)]">{m.user.name || m.user.email}</div>
              <div className="mt-0.5 text-xs text-[var(--dim)]">{m.user.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded bg-[var(--hover)] px-2 py-0.5 text-xs font-medium text-[var(--dim)]">
                {m.role}
              </span>
              {m.userId !== user?.id && (
                <button
                  onClick={() => removeMember(m.userId)}
                  className="text-[var(--dim)] hover:text-[var(--failed)]"
                  title="Remove member"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--dim)]">No members.</div>
        )}
      </div>
    </div>
  );
}
