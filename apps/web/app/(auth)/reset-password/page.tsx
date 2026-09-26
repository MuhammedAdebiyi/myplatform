"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.066 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
    </svg>
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

/* ─── Password rules (same as registration) ─── */
function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Must contain an uppercase letter";
  if (!/\d/.test(pw)) return "Must contain a number";
  return null;
}

type Strength = { score: number; label: string; color: string; checks: { label: string; passed: boolean }[] };

function getPasswordStrength(pw: string): Strength {
  const checks = [
    { label: "At least 8 characters", passed: pw.length >= 8 },
    { label: "One uppercase letter", passed: /[A-Z]/.test(pw) },
    { label: "One number", passed: /\d/.test(pw) },
    { label: "One special character", passed: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.passed).length;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-[var(--red)]", "bg-[var(--red)]", "bg-[var(--amber)]", "bg-[var(--amber)]", "bg-[var(--ok)]"];
  return { score, label: labels[score], color: colors[score], checks };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  return (
    <AnimatePresence>
      {password.length > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="mt-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < strength.score ? strength.color : "bg-[var(--border)]"}`}
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.05 }}
                  />
                ))}
              </div>
              <motion.span
                key={strength.label}
                initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }}
                className={`ml-3 text-[11px] font-medium ${
                  strength.score >= 4 ? "text-[var(--ok)]" : strength.score >= 2 ? "text-[var(--amber)]" : "text-[var(--red)]"
                }`}
              >
                {strength.label}
              </motion.span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {strength.checks.map((check) => (
                <motion.div
                  key={check.label}
                  className={`flex items-center gap-1.5 text-[11px] transition-colors ${check.passed ? "text-[var(--ok)]" : "text-[var(--muted)]/50"}`}
                  initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                >
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0 ${check.passed ? "border-[var(--ok)] bg-[var(--ok)]/10" : "border-[var(--muted)]/20"}`}>
                    {check.passed && <CheckIcon />}
                  </span>
                  {check.label}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
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
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
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
            type={isPassword && showPassword ? "text" : type}
            required={required}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`peer w-full rounded-xl border bg-[var(--surface)] py-3.5 ${icon ? "pl-11" : "pl-4"} ${
              isPassword ? "pr-12" : "pr-4"
            } text-sm text-[var(--fg)] placeholder-transparent transition-all duration-200 focus:outline-none focus:ring-2 ${
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
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]/50 hover:text-[var(--muted)] transition-colors z-[1]"
            >
              <EyeIcon open={showPassword} />
            </button>
          )}
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
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const missingToken = !token;

  function showError(field: "password" | "confirm") {
    if (!touched[field]) return undefined;
    return errors[field];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const passwordErr = validatePassword(password);
    const confirmErr = confirm !== password ? "Passwords don't match" : null;
    setTouched({ password: true, confirm: true });
    setErrors({ password: passwordErr ?? undefined, confirm: confirmErr ?? undefined });
    if (passwordErr || confirmErr) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Invalid / expired / already-used links all share one message.
        setApiError(data.message || "This reset link is invalid or has expired");
        return;
      }
      router.push("/login?reset=success");
      router.refresh();
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
            {missingToken ? "Link invalid" : "Set a new password"}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {missingToken
              ? "This reset link is invalid or has expired."
              : "Choose a strong password — your old sessions will be signed out."}
          </p>
        </motion.div>

        {missingToken ? (
          <motion.div variants={item} className="space-y-4">
            <Link
              href="/forgot-password"
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--fg)] py-3.5 text-sm font-semibold text-[var(--bg)] transition-all hover:opacity-90"
            >
              Request a new link
            </Link>
            <p className="text-center text-sm text-[var(--muted)]">
              <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">
                Back to sign in
              </Link>
            </p>
          </motion.div>
        ) : (
          <motion.form onSubmit={handleSubmit} variants={item} className="space-y-5">
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
            </AnimatePresence>

            <div>
              <FloatingInput
                id="new-password"
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (touched.password || touched.confirm) {
                    setErrors((e) => ({
                      password: (touched.password ? validatePassword(v) : e.password) ?? undefined,
                      confirm: touched.confirm ? (confirm !== v ? "Passwords don't match" : undefined) : e.confirm,
                    }));
                  }
                }}
                error={showError("password")}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                }
              />
              <PasswordStrengthMeter password={password} />
            </div>

            <FloatingInput
              id="confirm-password"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                if (touched.confirm) setErrors((e) => ({ ...e, confirm: v !== password ? "Passwords don't match" : undefined }));
              }}
              error={showError("confirm")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              }
            />

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
                    Updating...
                  </>
                ) : (
                  <>
                    Reset password
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </span>
            </motion.button>
          </motion.form>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
