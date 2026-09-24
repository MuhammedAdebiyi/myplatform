"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      fetch(`/api/auth/oauth?token=${encodeURIComponent(token)}`).then(() => {
        router.push("/projects");
        router.refresh();
      });
    } else {
      router.push("/login?error=oauth_failed");
    }
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        <p className="text-sm text-[var(--muted)]">Signing you in...</p>
      </motion.div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
