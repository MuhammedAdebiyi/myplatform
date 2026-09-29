"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

/* ─── Background ───
   Blur stays on static children — Safari re-rasterizes filter: blur() when the
   filtered element itself animates; wrappers only get cheap transforms. */
function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-1/2 -left-1/2 h-full w-full"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      >
        <div className="h-full w-full rounded-full bg-gradient-to-br from-[var(--accent)]/20 via-transparent to-transparent blur-[100px]" />
      </motion.div>
      <motion.div
        className="absolute -bottom-1/2 -right-1/2 h-full w-full"
        animate={{ rotate: [360, 0] }}
        transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
      >
        <div className="h-full w-full rounded-full bg-gradient-to-tl from-[#818CF8]/15 via-transparent to-transparent blur-[100px]" />
      </motion.div>
      <motion.div
        className="absolute top-1/3 right-1/4 h-64 w-64"
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="h-full w-full rounded-full bg-[var(--accent)]/5 blur-[80px]" />
      </motion.div>
    </div>
  );
}

function AnimatedLogo() {
  return (
    <motion.div className="relative" whileHover={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 0.5 }}>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/70 shadow-lg shadow-[var(--accent)]/20">
        <span className="text-xl font-black text-white">m</span>
        <motion.div
          className="absolute inset-0 rounded-2xl bg-[var(--accent)]"
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.div
        className="absolute -inset-1 rounded-2xl bg-[var(--accent)]/20 blur-md"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
    </motion.div>
  );
}

/* ─── Variants ─── */
const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

/** "a•••@gmail.com" — enough to recognize, not enough to harvest. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email[0]}•••${email.slice(at)}`;
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("send") === "failed"
      ? "Our email service didn't accept the message, so the code may never arrive. Request a new one below."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // StrictMode double-mounts the effect in dev; only ever auto-send once.
  const autoSentRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (data.user?.emailVerified) {
          router.replace("/projects");
          return;
        }
        const userEmail: string | null = data.user?.email ?? null;
        if (alive) setEmail(userEmail);

        // Auto-send for accounts with no active code (pre-existing
        // unverified users hitting the login-redirect path, or an expired
        // code): register-flow accounts already have a live code and must
        // not get a second email. Goes through the same resend endpoint as
        // the button, so it counts against the same 3/hour limit.
        const status = await fetch("/api/proxy/auth/verification-status");
        if (!status.ok || !alive) return;
        const { hasActiveCode } = await status.json().catch(() => ({}));
        if (hasActiveCode !== false || autoSentRef.current || !alive) return;
        autoSentRef.current = true;
        await resend({ auto: true, email: userEmail });
      } catch {
        router.replace("/login");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (res.ok) {
        router.push("/projects");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || "Verification failed. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function resend(opts?: { auto?: boolean; email?: string | null }) {
    const auto = opts?.auto ?? false;
    const targetEmail = opts?.email ?? email;
    if (resending || (!auto && cooldown > 0)) return;
    setError("");
    if (!auto) setNotice(null);
    setResending(true);
    try {
      const res = await fetch("/api/proxy/auth/resend-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Client-side 60s cooldown starts on any attempt (server allows 3/hour).
      setCooldown(60);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.sent === false) {
          setNotice(
            "Our email service didn't accept the message. Try again in a few minutes.",
          );
        } else if (auto) {
          setNotice(
            `Code sent to ${targetEmail ?? "your inbox"}. Check spam if you don't see it.`,
          );
        } else {
          setNotice(
            `A new code is on its way to ${targetEmail ? maskEmail(targetEmail) : "your inbox"}. Check spam if you don't see it.`,
          );
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Couldn't send right now. Try again shortly.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setResending(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // clear the cookie locally anyway
    }
    router.push("/login");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <GradientMesh />

      <motion.div variants={stagger} initial="hidden" animate="visible" className="relative z-10 w-full max-w-[380px]">
        <motion.div variants={item} className="mb-8">
          <AnimatedLogo />
          <h1 className="mt-5 font-heading text-[28px] font-bold tracking-tight text-[var(--fg)]">
            Verify your email
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {email ? (
              <>
                We sent a 6-digit code to{" "}
                <span className="font-medium text-[var(--fg)]">{maskEmail(email)}</span>.
                Enter it below to activate your account.
              </>
            ) : (
              "Check your inbox for the 6-digit code we sent you."
            )}
          </p>
        </motion.div>

        <motion.form onSubmit={submit} variants={item} className="space-y-5">
          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                className="rounded-xl border border-[var(--amber, #C4707A)]/40 bg-[var(--amber, #C4707A)]/5 px-4 py-3.5"
              >
                <p className="text-sm text-[var(--fg)]">{notice}</p>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                className="flex items-start gap-3 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-3"
                role="alert"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/15 text-[var(--red)]">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <p className="text-sm text-[var(--red)]">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="code" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]*"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (error) setError("");
              }}
              placeholder="000000"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-center text-lg font-mono tracking-[0.5em] text-[var(--fg)] placeholder:text-[var(--muted)]/40 transition-all duration-200 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            className="relative w-full overflow-hidden rounded-xl bg-[var(--fg)] py-3.5 text-sm font-semibold text-[var(--bg)] transition-all disabled:opacity-50"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg)] border-t-transparent" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify email
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </>
              )}
            </span>
          </motion.button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => resend()}
              disabled={cooldown > 0 || resending}
              className="font-medium text-[var(--accent)] transition-colors hover:underline disabled:text-[var(--muted)] disabled:no-underline"
            >
              {resending
                ? "Sending..."
                : cooldown > 0
                  ? `Send again in ${cooldown}s`
                  : "Send again"}
            </button>
            <button
              type="button"
              onClick={signOut}
              className="text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
            >
              Sign out
            </button>
          </div>
        </motion.form>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
