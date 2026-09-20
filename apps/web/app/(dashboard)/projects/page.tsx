"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  services: { id: string }[];
};

export default function ProjectsPage() {
  const { activeOrg } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeOrg) return;
    setLoading(true);
    fetch(`/api/proxy/organizations/${activeOrg.id}/projects`)
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.items ?? data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeOrg]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrg) return;
    setCreating(true);
    try {
      const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const res = await fetch(`/api/proxy/organizations/${activeOrg.id}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, slug }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects((prev) => [...prev, { ...project, services: [] }]);
        setShowNew(false);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  if (!activeOrg) {
    return (
      <div className="text-center py-20 text-[var(--dim)]">
        Select an organization to view projects.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-[var(--ink)]">Projects</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          + New project
        </button>
      </div>

      {showNew && (
        <form onSubmit={createProject} className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <label className="mb-2 block text-sm font-medium text-[var(--ink)]">Project name</label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="my-project"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowNew(false); setNewName(""); }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--dim)] hover:bg-[var(--hover)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--dim)]">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] py-16 text-center">
            <p className="text-sm text-[var(--dim)]">No projects yet.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 text-sm font-medium text-[var(--ink)] hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border)]">
            {projects.map((project, i) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className={`flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--hover)] ${
                  i > 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">{project.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-[var(--dim)]">{project.slug}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[var(--dim)]">
                    {project.services?.length ?? 0} service{(project.services?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                  <svg className="h-4 w-4 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
