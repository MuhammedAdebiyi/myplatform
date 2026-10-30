"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const installationId = searchParams.get("installation_id");
  const state = searchParams.get("state");
  const missingParams = !installationId || !state;
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (missingParams || ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const res = await fetch("/api/proxy/github/installations/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state,
            installationId: parseInt(installationId, 10),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "Installation could not be completed.");
          return;
        }
        const data = await res.json();
        router.replace(`/settings/github?success=true&org=${data.organizationId}`);
      } catch {
        setError("Network error while completing the installation.");
      }
    })();
  }, [router, searchParams, missingParams, installationId, state]);

  if (missingParams) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[var(--failed)]">Missing installation parameters.</p>
        <a
          href="/settings/github"
          className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
        >
          Back to settings
        </a>
      </div>
    );
  }

  return (
    <div className="py-20 text-center">
      {error ? (
        <>
          <p className="text-sm text-[var(--failed)]">{error}</p>
          <a
            href="/settings/github"
            className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
          >
            Back to settings
          </a>
        </>
      ) : (
        <>
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--dim)] border-t-transparent" />
          <p className="mt-4 text-sm text-[var(--dim)]">Completing GitHub installation…</p>
        </>
      )}
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
