"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "motion/react";

type Line = {
  text: string;
  color: "dim" | "default" | "green" | "red" | "amber";
};

const SEQUENCE: Line[] = [
  { text: "$ git push origin main", color: "dim" },
  { text: "\u2192 webhook received \u00b7 api/checkout", color: "default" },
  { text: "building image oci://ghcr.io/checkout:8f2a1c", color: "default" },
  { text: "  installing deps \u00b7 running tests \u00b7 41s", color: "dim" },
  { text: "\u2713 image pushed \u00b7 214MB", color: "green" },
  { text: "\u2192 deploying release rel_9f31\u2026", color: "default" },
  { text: "\u2717 health check failed on 2/3 instances", color: "red" },
  { text: "\u21a9 rolling back to rel_8e21\u2026", color: "amber" },
  { text: "\u2713 rollback complete \u00b7 traffic restored", color: "green" },
];

const COLOR_MAP: Record<Line["color"], string> = {
  dim: "text-[var(--muted)]",
  default: "text-[var(--pixel)]",
  green: "text-[var(--pixel-bright)]",
  red: "text-[var(--red)]",
  amber: "text-[var(--amber)]",
};

const LINE_DELAY = 400;
const PAUSE_AFTER = 3000;

export default function TerminalPanel() {
  const [visibleLines, setVisibleLines] = useState<Line[]>([]);
  const [cursorVisible, setCursorVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const runSequence = useCallback(() => {
    if (!mountedRef.current) return;
    setVisibleLines([]);

    let i = 0;

    function showNext() {
      if (!mountedRef.current) return;
      if (i >= SEQUENCE.length) {
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) runSequence();
        }, PAUSE_AFTER);
        return;
      }
      const line = SEQUENCE[i];
      i++;
      setVisibleLines((prev) => [...prev, line]);
      timerRef.current = setTimeout(showNext, LINE_DELAY);
    }

    showNext();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    runSequence();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runSequence]);

  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden terminal-glow">
      {/* Title bar */}
      <div className="relative flex items-center gap-3 px-5 py-3 bg-[var(--terminal-bar)] border-b border-white/[0.06]">
        <div className="flex gap-2">
          <span className="w-3 h-3 rounded-full bg-[var(--red)]/60 transition-colors hover:bg-[var(--red)]/90" />
          <span className="w-3 h-3 rounded-full bg-[var(--amber)]/60 transition-colors hover:bg-[var(--amber)]/90" />
          <span className="w-3 h-3 rounded-full bg-[var(--pixel)]/60 transition-colors hover:bg-[var(--pixel)]/90" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="font-mono text-[11px] text-white/30 tracking-wider uppercase">deploy.log</span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--pixel-bright)]/70 font-mono">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pixel-bright)]/40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--pixel-bright)]/80" />
          </span>
          live
        </span>
      </div>

      {/* Terminal body */}
      <div className="relative p-5 md:p-6 bg-[var(--terminal-bg)] font-mono text-[13px] md:text-sm leading-[2] min-h-[260px] md:min-h-[300px] overflow-x-auto">
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-[var(--pixel)]/[0.03] to-transparent pointer-events-none" />
        <div className="relative z-10">
          {visibleLines.map((line, idx) =>
            line ? (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -4, filter: "blur(2px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={`whitespace-nowrap ${COLOR_MAP[line.color]}`}
              >
                {line.text}
              </motion.div>
            ) : null,
          )}
          <span
            className={`inline-block w-[7px] h-[15px] bg-[var(--pixel)] ml-px align-middle transition-opacity duration-100 rounded-sm ${
              cursorVisible ? "opacity-80" : "opacity-0"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
