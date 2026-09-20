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
  createdAt: string;
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrg } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
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
    ]).then(([proj, svcData]) => {
      setProject(proj);
      setServices(svcData.items ?? svcData ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
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
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-[var(--dim)] hover:text-[var(--ink)]">
          Projects
        </Link>
        <span className="mx-1.5 text-[var(--dim)]">/</span>
        <span className="text-sm font-medium text-[var(--ink)]">{project.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">{project.name}</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          + New service
        </button>
      </div>
      <p className="mt-1 font-mono text-xs text-[var(--dim)]">{project.slug}</p>

      {showNew && (
        <form onSubmit={createService} className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
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
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border)]">
            {services.map((svc, i) => (
              <Link
                key={svc.id}
                href={`/projects/${id}/services/${svc.id}`}
                className={`flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--hover)] ${
                  i > 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">{svc.name}</div>
                  <div className="mt-0.5 text-xs text-[var(--dim)]">{svc.type.replace(/_/g, " ").toLowerCase()}</div>
                </div>
                <svg className="h-4 w-4 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
