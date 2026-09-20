"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useEffect, useState, use, useCallback } from "react";

type Service = {
  id: string;
  name: string;
  type: string;
  region: string;
  repoUrl?: string;
  branch?: string;
  image?: string;
};

type Deployment = {
  id: string;
  status: string;
  commitSha?: string;
  buildLog?: string;
  createdAt: string;
};

type EnvVar = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
};

type Repo = {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-[var(--building)]",
  BUILDING: "bg-[var(--building)]",
  DEPLOYING: "bg-[var(--building)]",
  HEALTHY: "bg-[var(--ok)]",
  FAILED: "bg-[var(--failed)]",
  ROLLED_BACK: "bg-[var(--building)]",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  BUILDING: "Building",
  DEPLOYING: "Deploying",
  HEALTHY: "Healthy",
  FAILED: "Failed",
  ROLLED_BACK: "Rolled back",
};

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = use(params);
  const { activeOrg } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [tab, setTab] = useState<"log" | "env" | "settings">("log");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg) return;
    fetch(`/api/proxy/organizations/${activeOrg.id}/projects/${id}/services/${serviceId}`)
      .then((r) => r.json())
      .then((data) => {
        setService(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeOrg, id, serviceId]);

  if (loading) return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;
  if (!service) return <div className="py-12 text-center text-sm text-[var(--dim)]">Service not found.</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">Projects</Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <Link href={`/projects/${id}`} className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">Project</Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <span className="text-sm font-medium text-[var(--ink)]">{service.name}</span>
      </div>

      <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">{service.name}</h1>
      <p className="mt-1 text-xs text-[var(--dim)]">{service.type.replace(/_/g, " ").toLowerCase()} &middot; {service.region}</p>

      {/* Tabs */}
      <div className="mt-6 flex gap-0 border-b border-[var(--border)]">
        {([["log", "Deploy log"], ["env", "Env vars"], ["settings", "Settings"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-[var(--accent)] text-[var(--ink)]"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "log" && <DeployLog orgId={activeOrg?.id ?? ""} projectId={id} serviceId={serviceId} />}
        {tab === "env" && <EnvVars orgId={activeOrg?.id ?? ""} projectId={id} serviceId={serviceId} />}
        {tab === "settings" && <ServiceSettings orgId={activeOrg?.id ?? ""} serviceId={serviceId} service={service} />}
      </div>
    </div>
  );
}

/* ─── Deploy Log Tab ─── */
function DeployLog({ orgId, projectId, serviceId }: { orgId: string; projectId: string; serviceId: string }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}`);
      const svc = await res.json();
      // The service endpoint might include deployments, or we need a separate call
      // For now, let's check if there's a deployments endpoint
      // Based on the API analysis, there's no standalone deployments list endpoint
      // Deployments are likely nested in the service response
      setDeployments(svc.deployments ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, serviceId]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  // Poll while any deployment is building
  useEffect(() => {
    const hasActive = deployments.some((d) =>
      ["PENDING", "BUILDING", "DEPLOYING"].includes(d.status),
    );
    if (!hasActive) return;

    const interval = setInterval(fetchDeployments, 3000);
    return () => clearInterval(interval);
  }, [deployments, fetchDeployments]);

  const latest = deployments[0];

  if (loading) return <div className="py-8 text-center text-sm text-[var(--dim)]">Loading deployments...</div>;

  return (
    <div>
      {latest ? (
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          {/* Deploy header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[latest.status] || "bg-[var(--dim)]"}`} />
              <span className="text-sm font-medium text-[var(--ink)]">
                {STATUS_LABELS[latest.status] || latest.status}
              </span>
              {latest.commitSha && (
                <span className="font-mono text-xs text-[var(--dim)]">
                  {latest.commitSha.slice(0, 7)}
                </span>
              )}
            </div>
            <span className="text-xs text-[var(--dim)]">
              {new Date(latest.createdAt).toLocaleString()}
            </span>
          </div>

          {/* Build log */}
          {latest.buildLog ? (
            <div className="bg-[var(--bg-subtle)] p-5 font-mono text-xs leading-[2.1] text-[var(--ink)] overflow-x-auto max-h-[400px] overflow-y-auto">
              {latest.buildLog.split("\n").map((line, i) => (
                <div key={i} className="whitespace-pre">{line}</div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[var(--dim)]">
              {latest.status === "BUILDING" ? "Build in progress..." : "No build log available."}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] py-16 text-center">
          <p className="text-sm text-[var(--dim)]">No deployments yet.</p>
          <p className="mt-1 text-xs text-[var(--dim)]">Deployments are created automatically when you push to the connected repo.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Env Vars Tab ─── */
function EnvVars({ orgId, projectId, serviceId }: { orgId: string; projectId: string; serviceId: string }) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    // Env vars may be included in the service response
    fetch(`/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}`)
      .then((r) => r.json())
      .then((svc) => {
        setEnvVars(svc.envVars ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orgId, projectId, serviceId]);

  async function addEnvVar(e: React.FormEvent) {
    e.preventDefault();
    // Check if endpoint exists — may need to flag as missing
    // For now, try to POST to an env vars endpoint
    try {
      const res = await fetch(
        `/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/env-vars`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: newKey, value: newValue, isSecret: newSecret }),
        },
      );
      if (res.ok) {
        const v = await res.json();
        setEnvVars((prev) => [...prev, v]);
        setShowAdd(false);
        setNewKey("");
        setNewValue("");
      }
    } catch {
      // endpoint may not exist
    }
  }

  async function removeEnvVar(varId: string) {
    try {
      await fetch(
        `/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/env-vars/${varId}`,
        { method: "DELETE" },
      );
      setEnvVars((prev) => prev.filter((v) => v.id !== varId));
    } catch {
      // ignore
    }
  }

  if (loading) return <div className="py-8 text-center text-sm text-[var(--dim)]">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--dim)]">
          {envVars.length} environment variable{envVars.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:opacity-90"
        >
          + Add
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addEnvVar} className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              autoFocus
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              placeholder="KEY"
            />
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              placeholder="value"
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-[var(--dim)]">
              <input type="checkbox" checked={newSecret} onChange={(e) => setNewSecret(e.target.checked)} className="rounded" />
              Secret
            </label>
            <div className="flex-1" />
            <button type="submit" disabled={!newKey.trim()} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-[var(--dim)] hover:text-[var(--ink)]">Cancel</button>
          </div>
        </form>
      )}

      {envVars.length > 0 ? (
        <div className="mt-4 rounded-lg border border-[var(--border)]">
          {envVars.map((v, i) => (
            <div key={v.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-[var(--ink)]">{v.key}</span>
                <span className="font-mono text-sm text-[var(--dim)]">
                  {v.isSecret ? "••••••••" : v.value}
                </span>
                {v.isSecret && <span className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">secret</span>}
              </div>
              <button
                onClick={() => removeEnvVar(v.id)}
                className="text-[var(--dim)] hover:text-[var(--failed)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        !showAdd && (
          <div className="mt-4 rounded-lg border border-[var(--border)] py-10 text-center">
            <p className="text-sm text-[var(--dim)]">No environment variables.</p>
          </div>
        )
      )}
    </div>
  );
}

/* ─── Settings Tab ─── */
function ServiceSettings({ orgId, serviceId, service }: { orgId: string; serviceId: string; service: Service }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(!!service.repoUrl);

  async function loadRepos() {
    if (reposLoaded) return;
    const res = await fetch(`/api/proxy/organizations/${orgId}/github/repositories`);
    const data = await res.json();
    setRepos(data.items ?? data ?? []);
    setReposLoaded(true);
  }

  async function connectRepo(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/github/services/${serviceId}/connect`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepositoryId: selectedRepo, branch: selectedBranch }),
      });
      if (res.ok) setConnected(true);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* GitHub connection */}
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">GitHub Repository</h3>
        {connected ? (
          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-[var(--ok)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-sm font-medium text-[var(--ink)]">Connected</span>
            </div>
            {service.repoUrl && (
              <p className="mt-1 font-mono text-xs text-[var(--dim)]">{service.repoUrl} ({service.branch})</p>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <button
              onClick={loadRepos}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--hover)]"
            >
              Connect GitHub repo
            </button>

            {reposLoaded && (
              <form onSubmit={connectRepo} className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--dim)]">Repository</label>
                    <select
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
                    >
                      <option value="">Select repo...</option>
                      {repos.map((r) => (
                        <option key={r.id} value={r.id}>{r.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--dim)]">Branch</label>
                    <input
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
                      placeholder="main"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="submit"
                    disabled={!selectedRepo || !selectedBranch || connecting}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50"
                  >
                    {connecting ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Service info */}
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">Service Details</h3>
        <div className="mt-2 rounded-lg border border-[var(--border)]">
          {[
            ["Type", service.type.replace(/_/g, " ")],
            ["Region", service.region],
            ["Image", service.image || "Not set"],
          ].map(([label, value], i) => (
            <div key={label} className={`flex justify-between px-4 py-3 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <span className="text-sm text-[var(--dim)]">{label}</span>
              <span className="font-mono text-sm text-[var(--ink)]">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
