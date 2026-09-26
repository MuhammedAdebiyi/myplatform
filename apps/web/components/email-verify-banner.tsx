"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

/**
 * Shown when the signed-in user's email is not yet verified (password
 * accounts — OAuth users are born verified). Two tones:
 *
 *  - default:            "check your inbox" + resend button
 *  - ?verify=email-delayed: register response told us NotificationHub
 *    rejected/failed the send → warn explicitly that the email may never
 *    arrive, so the user knows it's delivery, not their spam folder alone.
 */
function BannerInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const sendFailed = searchParams.get("verify") === "email-delayed";

  const [dismissed, setDismissed] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");

  if (!user || user.emailVerified !== false || dismissed) return null;

  async function handleResend() {
    if (!user) return;
    const email = user.email;
    setResendState("sending");
    setResendMessage("");
    try {
      const res = await fetch("/api/proxy/auth/resend-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.sent === false) {
          setResendState("error");
          setResendMessage(
            "The email service didn't accept the message. Try again in a few minutes.",
          );
        } else {
          setResendState("sent");
          setResendMessage(`Code sent to ${email}. Check spam if you don't see it.`);
        }
      } else if (res.status === 429) {
        setResendState("error");
        setResendMessage("Too many resend requests. Try again later.");
      } else {
        setResendState("error");
        setResendMessage("Couldn't send right now. Try again shortly.");
      }
    } catch {
      setResendState("error");
      setResendMessage("Couldn't reach the server. Check your connection.");
    }
  }

  const tone = sendFailed || resendState === "error";

  return (
    <div
      role="status"
      className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
        tone
          ? "border-[var(--amber, #C4707A)]/40 bg-[var(--amber, #C4707A)]/5"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          tone ? "bg-[var(--amber, #C4707A)]/15 text-[var(--amber, #C4707A)]" : "bg-[var(--accent)]/10 text-[var(--accent)]"
        }`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--fg)]">
          {sendFailed
            ? "Your verification email may be delayed or missing"
            : "Verify your email"}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">
          {sendFailed ? (
            <>
              We couldn&apos;t send it right away — this is on our email service, not
              your inbox. Your account works meanwhile; request a new code below.
            </>
          ) : (
            <>
              We sent a code to <span className="font-medium text-[var(--fg)]">{user.email}</span>.
              Enter it to get the verified badge.
            </>
          )}
          {resendMessage && <span className="mt-1 block text-[var(--muted)]">{resendMessage}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleResend}
          disabled={resendState === "sending"}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
        >
          {resendState === "sending"
            ? "Sending…"
            : resendState === "sent"
              ? "Resend"
              : sendFailed
                ? "Send again"
                : "Resend code"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded-lg px-2 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function EmailVerifyBanner() {
  return (
    <Suspense fallback={null}>
      <BannerInner />
    </Suspense>
  );
}
