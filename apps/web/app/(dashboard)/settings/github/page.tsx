"use client";

import { useAuth } from "@/components/auth-provider";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type InstallationStatus =
  | { connected: false }
  | {
      connected: true;
      installationId: number;
      accountLogin: string;
      accountType: string;
      suspended: boolean;
      repositoryCount: number;
    };

type Repo = {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export default function GitHubSettingsPage() {
  return (
    <Suspense>
      <GitHubSettingsInner />
    </Suspense>
  );
}

function GitHubSettingsInner() {
  const { activeOrg, organizations } = useAuth();
  const searchParams = useSearchParams();
  const installSuccess = searchParams.get("success") === "true";
  const installError = searchParams.get("error");
  const [status, setStatus] = useState<InstallationStatus | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/organizations/${activeOrg.id}/github/installation`,
      );
      const data: InstallationStatus = await res.json();
      setStatus(data);
      if (data.connected) {
        const reposRes = await fetch(
          `/api/proxy/organizations/${activeOrg.id}/github/repositories`,
        );
        if (reposRes.ok) {
          const reposData = await reposRes.json();
          setRepos(reposData.items ?? reposData ?? []);
        }
      }
    } catch {
      setError("Could not load GitHub connection status.");
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    load();
  }, [load]);

  async function syncRepos() {
    setSyncing(true);
    await load();
    setSyncing(false);
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;
  }

  if (!activeOrg) {
    return (
      <div className="py-12 text-center text-sm text-[var(--dim)]">
        Select an organization first.
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">GitHub</h1>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Connect the myplatform GitHub App to <span className="font-medium text-[var(--ink)]">{activeOrg.name}</span> so we can build and deploy your repositories.
      </p>

      {installSuccess && (
        <div className="mt-4 rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/5 px-4 py-3 text-sm text-[var(--ok)]">
          GitHub App installed successfully.
        </div>
      )}
      {installError && (
        <div className="mt-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-3 text-sm text-[var(--red)]">
          GitHub installation failed ({installError}). Try again.
        </div>
      )}

      {organizations.length === 0 && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--dim)]">
          You need an organization before you can connect GitHub.
        </div>
      )}

      {status?.connected ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-[var(--ok)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">
                    Connected to {status.accountLogin}
                    {status.suspended && (
                      <span className="ml-2 rounded bg-[var(--amber)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)]">
                        SUSPENDED
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--dim)]">
                    {status.repositoryCount} repositor{status.repositoryCount === 1 ? "y" : "ies"} accessible
                  </div>
                </div>
              </div>
              <a
                href={`https://github.com/settings/installations/${status.installationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--hover)]"
              >
                Configure on GitHub ↗
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--ink)]">Accessible repositories</h2>
            <button
              onClick={syncRepos}
              disabled={syncing}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--hover)] disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync repositories"}
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] py-10 text-center text-sm text-[var(--dim)]">
              No repositories accessible. Add repositories via "Configure on GitHub".
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--border)]">
              {repos.map((repo, i) => (
                <div key={repo.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
                  <div>
                    <span className="font-mono text-sm text-[var(--ink)]">{repo.fullName}</span>
                    {repo.private && <span className="ml-2 rounded bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">private</span>}
                  </div>
                  <span className="font-mono text-xs text-[var(--dim)]">{repo.defaultBranch}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-sm text-[var(--dim)]">
            The GitHub App is not installed for this organization yet.
          </p>
          <a
            href={`https://github.com/apps/placeholder/installations/new`}
            onClick={async (e) => {
              e.preventDefault();
              try {
                const res = await fetch(
                  `/api/proxy/organizations/${activeOrg.id}/github/install-url`,
                );
                if (!res.ok) throw new Error();
                const { url } = await res.json();
                window.location.href = url;
              } catch {
                setError("Could not start the GitHub installation. Try again.");
              }
            }}
            className="mt-4 inline-block rounded-lg bg-[var(--fg)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90"
          >
            Install myplatform GitHub App
          </a>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-3 text-sm text-[var(--red)]">
          {error}
        </div>
      )}
    </div>
  );
}
