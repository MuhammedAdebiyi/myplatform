"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useEffect, useState, use } from "react";

type Project = {
  id: string;
  name: string;
  slug: string;
};

type Service = {
  id: string;
  name: string;
  type: string;
  region: string;
  branch?: string;
  repoUrl?: string;
  lifecycle?: string;
  deployments?: { id: string; status: string; createdAt: string }[];
};

const TABS = ["Services", "Settings"] as const;

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrg } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Services");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("WEB_SERVICE");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeOrg) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/proxy/organizations/${activeOrg.id}/projects/${id}`).then((r) => r.json()),
      fetch(`/api/proxy/organizations/${activeOrg.id}/projects/${id}/services`).then((r) => r.json()),
    ])
      .then(([proj, svcData]) => {
        setProject(proj);
        const list: Service[] = Array.isArray(svcData)
          ? svcData
          : Array.isArray(svcData?.items)
            ? svcData.items
            : [];
        setServices(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeOrg, id]);

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrg) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/proxy/organizations/${activeOrg.id}/projects/${id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, type: newType }),
      });
      if (res.ok) {
        const svc = await res.json();
        setServices((prev) => [...prev, svc]);
        setShowNew(false);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>;
  if (!project) return <div className="py-12 text-center text-sm text-[var(--dim)]">Project not found.</div>;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/projects" className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">
          Projects
        </Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <span className="text-sm font-medium text-[var(--ink)]">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--accent-contrast)]">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="font-heading text-xl font-bold text-[var(--ink)]">{project.name}</h1>
            <p className="font-mono text-xs text-[var(--dim)]">{project.slug}</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          + New service
        </button>
      </div>

      {/* Sub-navigation (Vercel-style) */}
      <div className="mt-6 flex gap-0 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-[var(--accent)] text-[var(--ink)]"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Settings" ? (
        <ProjectSettings project={project} />
      ) : (
        <>
          {showNew && (
            <form onSubmit={createService} className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ink)]">Name</label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    placeholder="my-service"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ink)]">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
                  >
                    <option value="WEB_SERVICE">Web Service</option>
                    <option value="WORKER">Worker</option>
                    <option value="CRON_JOB">Cron Job</option>
                    <option value="STATIC_SITE">Static Site</option>
                    <option value="PRIVATE_SERVICE">Private Service</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={creating || !newName.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50">
                  Create
                </button>
                <button type="button" onClick={() => { setShowNew(false); setNewName(""); }} className="rounded-lg px-4 py-2 text-sm text-[var(--dim)] hover:bg-[var(--hover)]">
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-6">
            {services.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] py-16 text-center">
                <p className="text-sm text-[var(--dim)]">No services yet.</p>
                <button onClick={() => setShowNew(true)} className="mt-3 text-sm font-medium text-[var(--ink)] hover:underline">
                  Create your first service
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border)]">
                {services.map((svc, i) => {
                  const latest = svc.deployments?.[0];
                  const status = latest?.status;
                  return (
                    <Link
                      key={svc.id}
                      href={`/projects/${id}/services/${svc.id}`}
                      className={`flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--hover)] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--bg-subtle)] text-[10px] font-bold text-[var(--dim)]">
                          {svc.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-[var(--ink)]">{svc.name}</div>
                          <div className="mt-0.5 text-xs text-[var(--dim)]">
                            {svc.type.replace(/_/g, " ").toLowerCase()}
                            {svc.branch && <> · {svc.branch}</>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {status && (
                          <span className={`flex items-center gap-1.5 text-xs text-[var(--dim)]`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              status === "HEALTHY" ? "bg-[var(--ok)]" :
                              status === "FAILED" ? "bg-[var(--failed)]" :
                              "bg-[var(--building)]"
                            }`} />
                            {status.toLowerCase()}
                          </span>
                        )}
                        <svg className="h-4 w-4 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Project Settings tab ─── */
function ProjectSettings({ project }: { project: Project }) {
  return (
    <div className="mt-6 max-w-[560px] space-y-6">
      <div className="rounded-lg border border-[var(--border)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-medium text-[var(--ink)]">Project information</h3>
        </div>
        <div className="px-5 py-4">
          {[
            ["Name", project.name],
            ["Slug", project.slug],
            ["Project ID", project.id],
          ].map(([label, value], i) => (
            <div key={label} className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
              <span className="text-sm text-[var(--dim)]">{label}</span>
              <span className={`text-sm text-[var(--ink)] ${label !== "Name" ? "font-mono text-xs" : ""}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/5">
        <div className="border-b border-[var(--red)]/20 px-5 py-4">
          <h3 className="text-sm font-medium text-[var(--red)]">Danger zone</h3>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">Delete project</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">
              Soft-deletes this project and all services. Data is retained for 30 days.
            </p>
          </div>
          <DeleteProjectButton projectId={project.id} projectName={project.name} />
        </div>
      </div>
    </div>
  );
}

function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { activeOrg } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-[var(--red)]/40 px-3 py-1.5 text-xs font-medium text-[var(--red)] hover:bg-[var(--red)]/10"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type project name to confirm"
          className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
        />          <button
            disabled={deleting || !activeOrg || name !== projectName}
            onClick={async () => {
            if (!activeOrg) return;
            setDeleting(true);
            setError("");
            try {
              const res = await fetch(
                `/api/proxy/organizations/${activeOrg.id}/projects/${projectId}`,
                { method: "DELETE" },
              );
              if (res.ok || res.status === 204) {
                window.location.href = "/projects";
              } else {
                const data = await res.json().catch(() => ({}));
                setError(data.message || "Delete failed.");
                setDeleting(false);
              }
            } catch {
              setError("Network error.");
              setDeleting(false);
            }
          }}
          className="rounded-lg bg-[var(--red)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Confirm"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs text-[var(--dim)] hover:text-[var(--ink)]">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
