"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import FluidOrb from "@/components/ui/fluid-orb";
import AnimatedCounter from "@/components/ui/animated-counter";
import TerminalPanel from "@/components/terminal-panel";
import ScrollReveal from "@/components/scroll-reveal";
import ThemeToggle from "@/components/theme-toggle";

const STATS = [
  { value: 50000, label: "DEPLOYS RUN", suffix: "+" },
  { value: 99.95, label: "PLATFORM UPTIME", suffix: "%", decimals: 2 },
  { value: 12, label: "REGIONS LIVE", suffix: "+" },
  { value: 45, label: "MEDIAN BUILD TIME", suffix: "s", prefix: "<" },
];

const STEPS = [
  {
    number: "01",
    title: "Push",
    description:
      "Git push triggers a webhook. The platform ingests the commit, resolves the branch, and queues a build.",
  },
  {
    number: "02",
    title: "Build",
    description:
      "An isolated runner spins up, installs dependencies, compiles assets, and produces a deployment artifact.",
  },
  {
    number: "03",
    title: "Registry",
    description:
      "Artifacts are tagged, stored, and versioned in a private registry. Every build is immutable and traceable.",
  },
  {
    number: "04",
    title: "Schedule",
    description:
      "The scheduler picks the target region, provisions resources, and prepares the release pipeline.",
  },
  {
    number: "05",
    title: "Live",
    description:
      "Traffic shifts to the new build with zero downtime. Health checks gate the rollout. Rollback is instant.",
  },
];

const FEATURES = [
  {
    title: "Isolated builds",
    description:
      "Every build runs in a clean, ephemeral environment. No shared state, no side effects, no surprises.",
  },
  {
    title: "Health-gated releases",
    description:
      "Deployments only complete when health checks pass. If something breaks, traffic stays on the last known good.",
  },
  {
    title: "Full audit trail",
    description:
      "Every action is logged: who triggered it, what changed, and when. Compliance without the paperwork.",
  },
];

const LANGUAGES = ["Node.js", "Python", ".NET", "Go", "Next.js", "Rust", "PHP"];

const ROADMAP = [
  {
    title: "Registry-backed builds",
    description:
      "Builds will pull directly from your private registry, cutting build times by reusing cached layers.",
  },
  {
    title: "Isolated builds",
    description:
      "Sandboxed build environments with hardware-level isolation for maximum security and reproducibility.",
  },
  {
    title: "Multi-region hosts",
    description:
      "Deploy to multiple regions simultaneously with automatic failover and latency-based routing.",
  },
];

function LanguageMarquee() {
  const doubled = [...LANGUAGES, ...LANGUAGES];

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-[var(--bg)] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-[var(--bg)] to-transparent" />
      <motion.div
        className="flex gap-4"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((lang, i) => (
          <span
            key={`${lang}-${i}`}
            className="flex-shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {lang}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed left-0 top-0 z-50 h-[2px] bg-[var(--accent)]"
        style={{ width: progressWidth }}
      />

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-heading text-lg font-bold tracking-tight">
            myplatform
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#pipeline" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
              Pipeline
            </a>
            <a href="#features" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
              Features
            </a>
            <a href="#stack" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
              Stack
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section ref={heroRef} className="relative overflow-hidden px-6 py-32">
        <div className="hero-grid absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute left-1/4 top-1/4 -z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.8 }}
          >
            <FluidOrb color="#14B8A6" size={320} />
          </motion.div>
        </div>
        <div className="pointer-events-none absolute right-1/4 bottom-1/4 -z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <FluidOrb color="#818CF8" size={280} />
          </motion.div>
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <motion.p
            className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            from commit to production
          </motion.p>

          <motion.h1
            className="font-heading text-4xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            The deployment platform she told you not to worry about.
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            Push your code. We handle the rest. From build to production in seconds
            with isolated environments, health-gated rollouts, and instant rollbacks.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Link
              href="/register"
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-90"
            >
              Connect a repository
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-[var(--border-strong)] px-6 py-3 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--surface)]"
            >
              Read the docs
            </Link>
          </motion.div>

          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <TerminalPanel />
          </motion.div>

          <motion.div
            className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-[var(--fg)]">
                  {stat.prefix}
                  <AnimatedCounter value={stat.value} decimals={stat.decimals} />
                  {stat.suffix}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section id="pipeline" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Pipeline
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl">
              From git push to live in five steps.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              Every deployment follows a deterministic pipeline. No magic. No hidden steps.
              You see exactly what happens and when.
            </p>
          </ScrollReveal>

          <div className="mt-16 grid gap-8 md:grid-cols-5">
            {STEPS.map((step, i) => (
              <ScrollReveal key={step.number} delay={i * 0.1}>
                <div className="group relative">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--muted)] transition-colors group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]">
                      {step.number}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="hidden h-[1px] flex-1 bg-[var(--border)] md:block" />
                    )}
                  </div>
                  <h3 className="font-heading text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto h-px max-w-6xl bg-[var(--border)]" />

      {/* Features Section */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Features
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl">
              Built for teams that ship fast.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              The features you need to deploy with confidence. No bloat, no compromise.
            </p>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 0.1}>
                <div className="glass-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 transition-colors hover:border-[var(--accent)]">
                  <h3 className="font-heading text-xl font-bold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                    {feature.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto h-px max-w-6xl bg-[var(--border)]" />

      {/* Why Self-Hosted Section */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <div className="relative">
              <span className="absolute -top-12 left-1/2 -translate-x-1/2 text-8xl font-bold text-[var(--accent)] opacity-20">
                &ldquo;
              </span>
              <h2 className="font-heading text-3xl font-bold leading-snug md:text-4xl">
                Your infrastructure. Your data. Your uptime.
              </h2>
              <p className="mt-8 text-lg leading-relaxed text-[var(--muted)]">
                When you self-host, you own the entire stack. Your code never leaves your network.
                Your data stays on your servers. Your uptime SLA is yours to define. No third-party
                dependencies, no vendor lock-in, no surprise bills. Just your platform, running on
                your terms.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <div className="section-divider mx-auto h-px max-w-6xl bg-[var(--border)]" />

      {/* Stack Section */}
      <section id="stack" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Stack
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl">
              Your stack. Your rules.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              Deploy any language, any framework. We support the tools your team already uses.
            </p>
          </ScrollReveal>

          <div className="mt-16">
            <LanguageMarquee />
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto h-px max-w-6xl bg-[var(--border)]" />

      {/* Roadmap Section */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Roadmap
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl">
              What&apos;s coming next.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              We&apos;re building the future of deployment. Here&apos;s what&apos;s on the horizon.
            </p>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {ROADMAP.map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 0.1}>
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 transition-colors hover:border-[var(--accent)]">
                  <span className="mb-3 inline-block rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                    upcoming
                  </span>
                  <h3 className="font-heading text-xl font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 py-24">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-heading text-3xl font-bold md:text-5xl">
              Push it. See what happens.
            </h2>
            <p className="mt-6 text-lg text-[var(--muted)]">
              Get started in minutes. Connect your repo and deploy your first project today.
            </p>
            <div className="mt-10">
              <Link
                href="/register"
                className="inline-block rounded-lg bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-90"
              >
                Get started
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-4">
            <div>
              <Link href="/" className="font-heading text-lg font-bold tracking-tight">
                myplatform
              </Link>
              <p className="mt-3 text-sm text-[var(--muted)]">
                The deployment platform for teams that ship fast.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--fg)]">
                Product
              </h4>
              <ul className="space-y-2 text-sm text-[var(--muted)]">
                <li><a href="#pipeline" className="transition-colors hover:text-[var(--fg)]">Pipeline</a></li>
                <li><a href="#features" className="transition-colors hover:text-[var(--fg)]">Features</a></li>
                <li><a href="#stack" className="transition-colors hover:text-[var(--fg)]">Stack</a></li>
                <li><Link href="/projects" className="transition-colors hover:text-[var(--fg)]">Projects</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--fg)]">
                Company
              </h4>
              <ul className="space-y-2 text-sm text-[var(--muted)]">
                <li><Link href="/blog" className="transition-colors hover:text-[var(--fg)]">Blog</Link></li>
                <li><Link href="/docs" className="transition-colors hover:text-[var(--fg)]">Docs</Link></li>
                <li><Link href="/changelog" className="transition-colors hover:text-[var(--fg)]">Changelog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--fg)]">
                Legal
              </h4>
              <ul className="space-y-2 text-sm text-[var(--muted)]">
                <li><Link href="/privacy" className="transition-colors hover:text-[var(--fg)]">Privacy</Link></li>
                <li><Link href="/terms" className="transition-colors hover:text-[var(--fg)]">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-[var(--border)] pt-8 text-center text-sm text-[var(--dim-subtle)]">
            &copy; {new Date().getFullYear()} myplatform. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

