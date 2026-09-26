"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

/* ─── Background ─── */
function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-1/2 -left-1/2 h-full w-full rounded-full bg-gradient-to-br from-[var(--accent)]/20 via-transparent to-transparent blur-[100px]"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute -bottom-1/2 -right-1/2 h-full w-full rounded-full bg-gradient-to-tl from-[#818CF8]/15 via-transparent to-transparent blur-[100px]"
        animate={{ rotate: [360, 0] }}
        transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-[var(--accent)]/5 blur-[80px]"
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
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

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return null;
}

/* ─── Floating input ─── */
function FloatingInput({
  id, label, type, value, onChange, error, required, autoComplete, icon,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; error?: string; required?: boolean;
  autoComplete?: string; icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const floating = focused || value.length > 0;

  return (
    <div>
      <div className="relative">
        <motion.label
          htmlFor={id}
          className={`absolute z-10 pointer-events-none transition-all duration-200 ${
            floating
              ? "-top-2.5 left-3 bg-[var(--bg)] px-1.5 text-[11px] font-medium"
              : `${icon ? "left-11" : "left-4"} top-1/2 -translate-y-1/2 text-sm`
          } ${error ? "text-[var(--red)]" : floating ? "text-[var(--accent)]" : "text-[var(--muted)]/60"}`}
        >
          {label}
        </motion.label>

        <div className="relative">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]/50 z-[1]">
              {icon}
            </div>
          )}
          <input
            id={id}
            type={type}
            required={required}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`peer w-full rounded-xl border bg-[var(--surface)] py-3.5 ${icon ? "pl-11" : "pl-4"} pr-4 text-sm text-[var(--fg)] placeholder-transparent transition-all duration-200 focus:outline-none focus:ring-2 ${
              error
                ? "border-[var(--red)] focus:border-[var(--red)] focus:ring-[var(--red)]/20"
                : "border-[var(--border)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"
            }`}
            placeholder={label}
          />
          <motion.div
            className="absolute bottom-0 left-1/2 h-0.5 rounded-full bg-[var(--accent)]"
            initial={false}
            animate={{ width: focused ? "100%" : "0%", x: "-50%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="mt-1.5 pl-1 text-xs text-[var(--red)]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Page ─── */
function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setApiError("");
    const err = validateEmail(email.trim());
    setEmailError(err);
    if (err) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.message || "Something went wrong. Try again.");
        return;
      }
      // Generic server message — identical whether or not the account exists.
      setSentMessage(data.message);
    } catch {
      setApiError("Something went wrong. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <GradientMesh />

      <motion.div variants={stagger} initial="hidden" animate="visible" className="relative z-10 w-full max-w-[380px]">
        <motion.div variants={item} className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to home
          </Link>
        </motion.div>

        <motion.div variants={item} className="mb-8">
          <AnimatedLogo />
          <h1 className="mt-5 font-heading text-[28px] font-bold tracking-tight text-[var(--fg)]">
            Forgot your password?
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Enter your account email and we&apos;ll send you a reset link
          </p>
        </motion.div>

        <motion.form onSubmit={send} variants={item} className="space-y-5">
          <AnimatePresence>
            {apiError && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                className="flex items-start gap-3 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-3"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/15 text-[var(--red)]">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <p className="text-sm text-[var(--red)]">{apiError}</p>
              </motion.div>
            )}

            {sentMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                className="rounded-xl border border-[var(--ok)]/30 bg-[var(--ok)]/5 px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ok)]/15 text-[var(--ok)]">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                  <p className="text-sm text-[var(--ok)]">{sentMessage}</p>
                </div>
                <p className="mt-2.5 pl-8 text-xs text-[var(--muted)]">
                  The link expires in 30 minutes. If it doesn&apos;t arrive, check spam, or{" "}
                  <button
                    type="button"
                    onClick={() => setSentMessage(null)}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    try a different email
                  </button>
                  .
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!sentMessage && (
            <FloatingInput
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                if (emailError) setEmailError(validateEmail(v.trim()));
              }}
              error={emailError ?? undefined}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              }
            />
          )}

          <motion.button
            type={sentMessage ? "button" : "submit"}
            onClick={sentMessage ? send : undefined}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            className="relative w-full overflow-hidden rounded-xl bg-[var(--fg)] py-3.5 text-sm font-semibold text-[var(--bg)] transition-all disabled:opacity-50"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg)] border-t-transparent" />
                  Sending...
                </>
              ) : sentMessage ? (
                "Send again"
              ) : (
                <>
                  Send reset link
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </span>
          </motion.button>
        </motion.form>

        <motion.p variants={item} className="mt-6 text-center text-sm text-[var(--muted)]">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">
            Back to sign in
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
