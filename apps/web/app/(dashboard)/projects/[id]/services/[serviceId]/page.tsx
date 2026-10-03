"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useEffect, useState, use, useCallback } from "react";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* Shared deployment state so the header, deploy log and settings all see it. */
function useDeployments(orgId: string, projectId: string, serviceId: string) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/deployments`);
      if (res.ok) {
        const data = await res.json();
        const list: Deployment[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setDeployments(list);
      }
    } catch {
      // ignore
    }
  }, [orgId, projectId, serviceId]);

  const triggerDeploy = useCallback(async () => {
    setDeployError("");
    setDeploying(true);
    try {
      const res = await fetch(
        `/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/deployments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeployError(data.message || "Could not start the deployment.");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setDeployError("Network error while starting the deployment.");
      return false;
    } finally {
      setDeploying(false);
    }
  }, [orgId, projectId, serviceId, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any deployment is building
  const hasActive = deployments.some((d) =>
    ["PENDING", "BUILDING", "DEPLOYING"].includes(d.status),
  );
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [hasActive, refresh]);

  return { deployments, deploying, deployError, setDeployError, refresh, triggerDeploy };
}

type Service = {
  id: string;
  name: string;
  type: string;
  region: string;
  repoUrl?: string;
  branch?: string;
  image?: string;
  githubRepositoryId?: string;
  deployPullRequests?: boolean;
};

type Deployment = {
  id: string;
  status: string;
  commitSha?: string;
  imageDigest?: string;
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
  const orgId = activeOrg?.id ?? "";
  const { deployments, deploying, deployError, setDeployError, refresh: refreshDeployments, triggerDeploy } =
    useDeployments(orgId, id, serviceId);

  const fetchService = useCallback(async () => {
    if (!activeOrg) return;
    try {
      const res = await fetch(`/api/proxy/organizations/${activeOrg.id}/projects/${id}/services/${serviceId}`);
      const data = await res.json();
      setService(data);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, [activeOrg, id, serviceId]);

  useEffect(() => {
    fetchService();
  }, [fetchService]);

  if (loading) return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;
  if (!service) return <div className="py-12 text-center text-sm text-[var(--dim)]">Service not found.</div>;

  // "Current" = the deployment that is actually serving traffic right now:
  // the most recent healthy one. Building/pending ones are not live yet.
  const liveDeployment = deployments.find((d) => d.status === "HEALTHY");
  const buildingDeployment = deployments.find((d) =>
    ["PENDING", "BUILDING", "DEPLOYING"].includes(d.status),
  );

  return (
    <div>
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">Projects</Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <Link href={`/projects/${id}`} className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">Project</Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <span className="text-sm font-medium text-[var(--ink)]">{service.name}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">{service.name}</h1>
        {buildingDeployment ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--dim)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--building)]" />
            Deploying{buildingDeployment.commitSha ? ` ${buildingDeployment.commitSha.slice(0, 7)}` : ""}…
          </span>
        ) : liveDeployment ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]"
            title={`Live since ${new Date(liveDeployment.createdAt).toLocaleString()}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
            Live
            {liveDeployment.commitSha && (
              <span className="font-mono text-[var(--dim)]">{liveDeployment.commitSha.slice(0, 7)}</span>
            )}
            <span className="text-[var(--dim)]">· {timeAgo(liveDeployment.createdAt)}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--dim)]" />
            Not deployed yet
          </span>
        )}
      </div>
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
        {tab === "log" && (
          <DeployLog
            orgId={orgId}
            projectId={id}
            serviceId={serviceId}
            deployments={deployments}
            deploying={deploying}
            deployError={deployError}
            onRefresh={refreshDeployments}
            onTriggerDeploy={triggerDeploy}
          />
        )}
        {tab === "env" && <EnvVars orgId={orgId} projectId={id} serviceId={serviceId} />}
        {tab === "settings" && (
          <ServiceSettings
            orgId={orgId}
            serviceId={serviceId}
            service={service}
            onServiceChanged={fetchService}
            onTriggerDeploy={async () => {
              const ok = await triggerDeploy();
              if (ok) setTab("log");
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Deploy Log Tab ─── */
function DeployLog({
  orgId,
  projectId,
  serviceId,
  deployments,
  deploying,
  deployError,
  onRefresh,
  onTriggerDeploy,
}: {
  orgId: string;
  projectId: string;
  serviceId: string;
  deployments: Deployment[];
  deploying: boolean;
  deployError: string;
  onRefresh: () => void;
  onTriggerDeploy: () => Promise<boolean>;
}) {
  // "Current" = most recent healthy deployment (the one serving traffic).
  const liveId = deployments.find((d) => d.status === "HEALTHY")?.id;
  const triggerDeploy = () => onTriggerDeploy().then(() => undefined);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-[var(--dim)]">
          Deploys run automatically on push to the connected branch, or start one manually:
        </p>
        <button
          onClick={triggerDeploy}
          disabled={
            deploying ||
            deployments.some((d) => ["PENDING", "BUILDING", "DEPLOYING"].includes(d.status))
          }
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {deploying ? "Starting…" : "Deploy"}
        </button>
      </div>
      {deployError && (
        <div className="mb-4 rounded-lg border border-[var(--failed)]/30 bg-[var(--failed)]/5 px-4 py-3 text-sm text-[var(--failed)]">
          {deployError}
        </div>
      )}
      {deployments.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)]">
          {deployments.map((d, i) => (
            <DeploymentRow
              key={d.id}
              deployment={d}
              orgId={orgId}
              projectId={projectId}
              serviceId={serviceId}
              isFirst={i === 0}
              isLive={d.id === liveId}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] py-16 text-center">
          <p className="text-sm text-[var(--dim)]">No deployments yet.</p>
          <p className="mt-1 text-xs text-[var(--dim)]">Deployments are created automatically when you push to the connected repo, or click Deploy above.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Single deployment row (expandable) ─── */
function DeploymentRow({
  deployment,
  orgId,
  projectId,
  serviceId,
  isFirst,
  isLive,
  onRefresh,
}: {
  deployment: Deployment;
  orgId: string;
  projectId: string;
  serviceId: string;
  isFirst: boolean;
  isLive: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(isFirst);
  const [buildLog, setBuildLog] = useState<string | null>(deployment.buildLog ?? null);
  const [logLoaded, setLogLoaded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const isActive = ["PENDING", "BUILDING", "DEPLOYING"].includes(deployment.status);

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/deployments/${deployment.id}`,
      );
      if (res.ok) {
        const data = await res.json();
        setBuildLog(data.buildLog ?? null);
      }
    } catch {
      // keep whatever we have
    } finally {
      setLogLoaded(true);
    }
  }, [orgId, projectId, serviceId, deployment.id]);

  useEffect(() => {
    if (open && !logLoaded) loadLog();
  }, [open, logLoaded, loadLog]);

  // Refresh the log while the deployment is active and expanded.
  useEffect(() => {
    if (!open || !isActive) return;
    const interval = setInterval(loadLog, 3000);
    return () => clearInterval(interval);
  }, [open, isActive, loadLog]);

  async function cancel() {
    setCancelling(true);
    try {
      await fetch(
        `/api/proxy/organizations/${orgId}/projects/${projectId}/services/${serviceId}/deployments/${deployment.id}/cancel`,
        { method: "POST" },
      );
      onRefresh();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className={isFirst ? "" : "border-t border-[var(--border)]"}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[var(--hover)]"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[deployment.status] || "bg-[var(--dim)]"}`} />
          <span className="text-sm font-medium text-[var(--ink)]">
            {STATUS_LABELS[deployment.status] || deployment.status}
          </span>
          {isLive && (
            <span className="rounded-full border border-[var(--ok)]/40 bg-[var(--ok)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ok)]">
              Current
            </span>
          )}
          {deployment.commitSha && (
            <span className="font-mono text-xs text-[var(--dim)]">{deployment.commitSha.slice(0, 7)}</span>
          )}
          {deployment.imageDigest && (
            <span className="hidden font-mono text-xs text-[var(--dim)] sm:inline">{deployment.imageDigest.slice(0, 19)}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isActive && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                cancel();
              }}
              onKeyDown={(e) => e.key === "Enter" && cancel()}
              className="text-xs font-medium text-[var(--dim)] hover:text-[var(--failed)]"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </span>
          )}
          <span className="text-xs text-[var(--dim)]">{new Date(deployment.createdAt).toLocaleString()}</span>
          <svg
            className={`h-3.5 w-3.5 text-[var(--dim)] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)]">
          {buildLog ? (
            <div className="max-h-[420px] overflow-auto p-5 font-mono text-xs leading-[2.1] text-[var(--ink)]">
              {buildLog.split("\n").map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">{line}</div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-[var(--dim)]">
              {deployment.status === "PENDING"
                ? "Waiting for a build worker to claim this deployment…"
                : deployment.status === "BUILDING"
                  ? "Build in progress…"
                  : deployment.status === "DEPLOYING"
                    ? "Deploying container…"
                    : "No build log available."}
            </div>
          )}
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
function ServiceSettings({
  orgId,
  serviceId,
  service,
  onServiceChanged,
  onTriggerDeploy,
}: {
  orgId: string;
  serviceId: string;
  service: Service;
  onServiceChanged: () => void;
  onTriggerDeploy: () => Promise<void>;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(service.githubRepositoryId ?? "");
  const [branches, setBranches] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(service.branch ?? "");
  const [connectError, setConnectError] = useState("");
  const [reposError, setReposError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(!!service.githubRepositoryId);
  // Whether the user is pointing the service at a different repo than the
  // currently connected one (branch-only changes are non-disruptive).
  const isChangingRepo =
    !!service.githubRepositoryId && !!selectedRepo && selectedRepo !== service.githubRepositoryId;
  // After a successful connect, prompt for a fresh deploy like Vercel does.
  const [pendingDeployPrompt, setPendingDeployPrompt] = useState(false);

  async function loadRepos() {
    if (reposLoaded) return;
    const res = await fetch(`/api/proxy/organizations/${orgId}/github/repositories`);
    const data = await res.json().catch(() => ({}));
    // The proxy returns either an array, {items:[...]}, or an error object —
    // only ever put a real array into state.
    const list: Repo[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : [];
    setRepos(list);
    setReposError(
      res.ok
        ? list.length === 0
          ? "No repositories available. Install the GitHub App first (Settings → GitHub)."
          : ""
        : data.message || "Could not load repositories.",
    );
    setReposLoaded(true);
  }

  // Load live branches from GitHub whenever the repo selection changes.
  async function loadBranches(repoId: string) {
    if (!repoId) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    setBranchError(false);
    try {
      const res = await fetch(
        `/api/proxy/organizations/${orgId}/github/repositories/${repoId}/branches`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: { name: string; isDefault: boolean }[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];
      setBranches(list);
    } catch {
      setBranchError(true);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function connectRepo(e: React.FormEvent) {
    e.preventDefault();
    setConnectError("");
    setConnecting(true);
    try {
      const res = await fetch(`/api/proxy/organizations/${orgId}/github/services/${serviceId}/connect`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepositoryId: selectedRepo, branch: selectedBranch }),
      });
      if (res.ok) {
        setConnected(true);
        setPendingDeployPrompt(true);
        onServiceChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        setConnectError(data.message || "Could not connect the repository.");
      }
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
            <button
              onClick={() => {
                setConnected(false);
                setReposLoaded(false);
              }}
              className="mt-2 text-xs font-medium text-[var(--dim)] hover:text-[var(--ink)]"
            >
              Change repository or branch
            </button>
            <p className="mt-2 text-xs text-[var(--dim)]">
              You can change the connection at any time — nothing is locked. Existing deployments
              keep running their current build; your new repo/branch only takes effect on the
              next deploy.
            </p>
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
                {isChangingRepo && (
                  <div className="mb-3 rounded-lg border border-[var(--failed)]/30 bg-[var(--failed)]/5 px-4 py-3">
                    <p className="text-sm font-medium text-[var(--ink)]">You're switching repositories</p>
                    <p className="mt-1 text-xs text-[var(--dim)]">
                      Nothing breaks when you connect — but the currently running container keeps
                      serving the <span className="font-medium text-[var(--ink)]">old repo's build</span> (same
                      image, same domains) until you deploy the new repository. Domains and env vars stay
                      in place; only the next deploy changes what's running.
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--dim)]">Repository</label>
                    <select
                      value={selectedRepo}
                      onChange={(e) => {
                        setSelectedRepo(e.target.value);
                        setSelectedBranch("");
                        loadBranches(e.target.value);
                      }}
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
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      disabled={!selectedRepo || loadingBranches}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50"
                    >
                      <option value="">
                        {!selectedRepo
                          ? "Pick a repo first..."
                          : loadingBranches
                            ? "Loading branches..."
                            : "Select branch..."}
                      </option>
                      {branches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}{b.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    {branchError && (
                      <p className="mt-1 text-xs text-[var(--failed)]">
                        Could not load branches — check the GitHub App installation.
                      </p>
                    )}
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
                  {connectError && (
                    <span className="ml-3 text-xs text-[var(--failed)]">{connectError}</span>
                  )}
                  {reposError && (
                    <p className="mt-2 text-xs text-[var(--failed)]">{reposError}</p>
                  )}
                </div>
              </form>
            )}

            {connected && pendingDeployPrompt && (
              <div className="mt-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3">
                <p className="text-sm font-medium text-[var(--ink)]">Connection updated</p>
                <p className="mt-1 text-xs text-[var(--dim)]">
                  The running container is still serving the previous build. Trigger a fresh
                  deploy to build from {service.repoUrl} ({service.branch}).
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={async () => {
                      setPendingDeployPrompt(false);
                      await onTriggerDeploy();
                    }}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                  >
                    Deploy now
                  </button>
                  <button
                    onClick={() => setPendingDeployPrompt(false)}
                    className="text-xs font-medium text-[var(--dim)] hover:text-[var(--ink)]"
                  >
                    Not now
                  </button>
                </div>
              </div>
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
