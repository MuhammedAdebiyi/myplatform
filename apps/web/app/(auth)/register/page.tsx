"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function GoogleIcon() {
  return (
    <svg className="h-4.5 w-4.5" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4.5 w-4.5" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
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

/* ─── Floating particles ─── */
function AuthParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; y: number; size: number; duration: number; delay: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i, x: Math.random() * 100, y: Math.random() * 100,
        size: Math.random() * 3 + 1, duration: Math.random() * 20 + 15, delay: Math.random() * 10,
      })),
    );
  }, []);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-[var(--accent)]"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -30, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ─── Gradient mesh ─── */
function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-1/2 -right-1/2 h-full w-full rounded-full bg-gradient-to-bl from-[var(--accent)]/20 via-transparent to-transparent blur-[100px]"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-gradient-to-tr from-[#818CF8]/15 via-transparent to-transparent blur-[100px]"
        animate={{ rotate: [360, 0] }}
        transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

/* ─── Password strength ─── */
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
  id, label, type, value, onChange, error, required, minLength, autoComplete, icon,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; error?: string; required?: boolean;
  minLength?: number; autoComplete?: string; icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const floating = focused || value.length > 0;

  return (
    <div>
      <div className="relative">
        <label
          htmlFor={id}
          className={`absolute z-10 pointer-events-none transition-all duration-200 ${
            floating
              ? "-top-2.5 left-3 bg-[var(--bg)] px-1.5 text-[11px] font-medium"
              : `${icon ? "left-11" : "left-4"} top-1/2 -translate-y-1/2 text-sm`
          } ${error ? "text-[var(--red)]" : floating ? "text-[var(--accent)]" : "text-[var(--muted)]/60"}`}
        >
          {label}
        </label>

        <div className="relative">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]/50 z-[1]">{icon}</div>
          )}
          <input
            id={id}
            type={isPassword && showPassword ? "text" : type}
            required={required}
            minLength={minLength}
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
            className={`absolute bottom-0 left-1/2 h-0.5 rounded-full ${error ? "bg-[var(--red)]" : "bg-[var(--accent)]"}`}
            initial={false}
            animate={{ width: focused ? "100%" : "0%", x: "-50%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
          {isPassword && (
            <button
              type="button" tabIndex={-1}
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
            initial={{ opacity: 0, y: -4, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -4, height: 0 }}
            className="mt-1.5 pl-1 text-xs text-[var(--red)] flex items-center gap-1"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--red)]/10 shrink-0">
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" />
              </svg>
            </span>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Social button ─── */
function SocialButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm font-medium text-[var(--fg)] transition-all duration-300 hover:border-[var(--border-strong)] active:scale-[0.98]"
    >
      <motion.span className="absolute inset-0 bg-[var(--hover)]" initial={false} animate={{ opacity: hovered ? 1 : 0 }} transition={{ duration: 0.2 }} />
      <span className="relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">{icon}</span>
      <span className="relative z-10">{label}</span>
      <motion.span className="absolute right-0 top-0 h-full w-1 bg-[var(--accent)]" initial={false} animate={{ scaleY: hovered ? 1 : 0 }} transition={{ duration: 0.2 }} />
    </a>
  );
}

/* ─── Animated logo ─── */
function AnimatedLogo() {
  return (
    <motion.div className="relative" whileHover={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 0.5 }}>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/70 shadow-lg shadow-[var(--accent)]/20">
        <span className="text-xl font-black text-white">m</span>
        <motion.div className="absolute inset-0 rounded-2xl bg-[var(--accent)]" animate={{ opacity: [0, 0.4, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <motion.div className="absolute -inset-1 rounded-2xl bg-[var(--accent)]/20 blur-md" animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
    </motion.div>
  );
}

/* ─── Left showcase ─── */
function AuthShowcase() {
  const lines = [
    { text: "$ myplatform init", color: "text-[var(--muted)]" },
    { text: "→ detected Next.js 15 · Node 22", color: "text-[var(--fg)]" },
    { text: "→ connected to github.com/acme/app", color: "text-[var(--fg)]" },
    { text: "✓ project created · my-app", color: "text-[var(--ok)]" },
    { text: "→ building first deploy…", color: "text-[var(--fg)]" },
    { text: "✓ deployed in 38s", color: "text-[var(--ok)]" },
    { text: "→ https://app.myplatform.dev", color: "text-[var(--accent)]" },
  ];
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (visible >= lines.length) {
      const t = setTimeout(() => setVisible(0), 4000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible(v => v + 1), visible === 0 ? 600 : 350);
    return () => clearTimeout(t);
  }, [visible, lines.length]);

  return (
    <div className="hidden lg:flex relative w-1/2 items-center justify-center overflow-hidden bg-[var(--bg-subtle)] border-r border-[var(--border)]">
      <GradientMesh />
      <AuthParticles />
      <div className="relative z-10 w-full max-w-md px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <div>
            <h2 className="font-heading text-3xl font-bold text-[var(--fg)] leading-tight">
              Start deploying
              <span className="relative ml-2">
                <span className="relative z-10 text-[var(--accent)]">today</span>
                <motion.span
                  className="absolute bottom-1 left-0 h-3 w-full bg-[var(--accent)]/15 rounded"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: "left" }}
                />
              </span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Create your account and ship your first project in under a minute. Free for personal use.
            </p>
          </div>

          <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--terminal-bg)] shadow-2xl shadow-black/20">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--terminal-bar)] border-b border-white/5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]/80" />
              <span className="ml-2 text-[10px] font-mono text-white/30 uppercase tracking-wider">quickstart.sh</span>
            </div>
            <div className="p-4 font-mono text-[12px] leading-[1.8] min-h-[180px]">
              {lines.slice(0, visible).map((line, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className={line.color}>
                  {line.text}
                </motion.div>
              ))}
              <motion.span
                className="inline-block h-3.5 w-[7px] bg-[var(--accent)] ml-px align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.53, repeat: Infinity, repeatType: "reverse" }}
              />
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "38s", label: "Median deploy" },
              { icon: "ISO", label: "Isolated builds" },
              { icon: "12+", label: "Regions live" },
              { icon: "1-click", label: "Rollback" },
            ].map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <span className="text-sm">{f.icon}</span>
                <span className="text-xs font-medium text-[var(--fg)]">{f.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Validation ─── */
function validateName(name: string): string | null {
  if (!name) return "Name is required";
  if (name.length < 2) return "Must be at least 2 characters";
  return null;
}
function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return null;
}
function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Must contain an uppercase letter";
  if (!/\d/.test(pw)) return "Must contain a number";
  return null;
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

/* ═══════════════ REGISTER ═══════════════ */
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; password?: boolean }>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const showError = (field: "name" | "email" | "password") => {
    if (!touched[field]) return undefined;
    return errors[field];
  };

  const validateField = useCallback((field: "name" | "email" | "password", value: string) => {
    if (field === "name") return validateName(value);
    if (field === "email") return validateEmail(value);
    return validatePassword(value);
  }, []);

  const handleChange = useCallback((field: "name" | "email" | "password", value: string) => {
    if (field === "name") setName(value);
    else if (field === "email") setEmail(value);
    else setPassword(value);

    setErrors((prev) => {
      if (!touched[field]) return prev;
      const err = validateField(field, value);
      return { ...prev, [field]: err ?? undefined };
    });
  }, [touched, validateField]);

  const handleBlur = useCallback((field: "name" | "email" | "password") => {
    setTouched((t) => ({ ...t, [field]: true }));
    const value = field === "name" ? name : field === "email" ? email : password;
    const err = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: err ?? undefined }));
  }, [name, email, password, validateField]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");
    setTouched({ name: true, email: true, password: true });

    const newErrors = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };
    setErrors(newErrors);
    if (newErrors.name || newErrors.email || newErrors.password) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setApiError(data.message || "Registration failed");
        return;
      }

      router.push("/projects");
      router.refresh();
    } catch {
      setApiError("Something went wrong. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AuthShowcase />

      <div className="relative flex w-full lg:w-1/2 items-center justify-center overflow-hidden px-6 py-12">
        <GradientMesh />
        <AuthParticles />

        <motion.div
          variants={stagger} initial="hidden" animate="visible"
          className="relative z-10 w-full max-w-[380px]"
        >
          <motion.div variants={item} className="mb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to home
            </Link>
          </motion.div>

          <motion.div variants={item} className="mb-8">
            <AnimatedLogo />
            <h1 className="mt-5 font-heading text-[28px] font-bold tracking-tight text-[var(--fg)]">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Free forever for personal projects
            </p>
          </motion.div>

          <motion.div variants={item} className="space-y-3">
            <SocialButton href={`${API_URL}/auth/google?redirect_to=http://localhost:3000/projects`} icon={<GoogleIcon />} label="Sign up with Google" />
            <SocialButton href={`${API_URL}/auth/github?redirect_to=http://localhost:3000/projects`} icon={<GitHubIcon />} label="Sign up with GitHub" />
          </motion.div>

          <motion.div variants={item} className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[var(--bg)] px-3 text-xs font-medium text-[var(--muted)]">or sign up with email</span>
            </div>
          </motion.div>

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

            <FloatingInput
              id="name" label="Full name" type="text" autoComplete="name" required
              value={name}
              onChange={(v) => handleChange("name", v)}
              error={showError("name")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              }
            />

            <FloatingInput
              id="email" label="Email address" type="email" autoComplete="email" required
              value={email}
              onChange={(v) => handleChange("email", v)}
              error={showError("email")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              }
            />

            <div>
              <FloatingInput
                id="password" label="Password" type="password" autoComplete="new-password" required minLength={8}
                value={password}
                onChange={(v) => handleChange("password", v)}
                error={showError("password")}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                }
              />
              <PasswordStrengthMeter password={password} />
            </div>

            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="relative w-full overflow-hidden rounded-xl bg-[var(--fg)] py-3.5 text-sm font-semibold text-[var(--bg)] transition-all disabled:opacity-50"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg)] border-t-transparent" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create account
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </span>
            </motion.button>
          </motion.form>

          <motion.p variants={item} className="mt-6 text-center text-sm text-[var(--muted)]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">
              Sign in
            </Link>
          </motion.p>

          <motion.p variants={item} className="mt-4 text-center text-[11px] leading-relaxed text-[var(--muted)]/60">
            By creating an account you agree to our{" "}
            <Link href="#" className="underline hover:text-[var(--muted)]">Terms of Service</Link>
            {" "}and{" "}
            <Link href="#" className="underline hover:text-[var(--muted)]">Privacy Policy</Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
