"use client";

/**
 * The floating "Ask Runi" button, and the panel it opens.
 *
 * Mounted once, in the root layout, and shown only on the athlete's own
 * pages — the home screen, the plan, a run, the Numbers board, settings. It
 * is not on the landing page (nothing to ask yet), not on sign-in, and not on
 * the coach's screens, whose questions are about other people.
 *
 * It is fixed, not draggable. A button that can be anywhere is a button
 * nobody can find, and on a phone dragging fights scrolling. What it does
 * instead is get out of the way: scroll down and it folds to the mark alone;
 * scroll up and the label comes back. While the panel is open the button is
 * gone — the panel has its own close.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/ui/BrandMark";
import { InsightsPanel } from "@/components/insights/InsightsPanel";

const SHOW_ON = ["/dashboard", "/plan", "/activities", "/numbers", "/settings"];

export function AskRuniLauncher() {
  const pathname = usePathname();
  // The panel is open *for a route*: it closes when the route changes, because
  // a panel about "your runs" carried into settings is a panel that looks
  // stuck. Remembering which route it opened on derives that without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);

  const visible = SHOW_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Fold on the way down, unfold on the way up. A dead band of a few pixels
  // keeps a wobbling thumb from flickering it.
  useEffect(() => {
    if (!visible) return;
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) < 6) return;
      setCompact(dy > 0 && y > 120);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className={`ask-fab${compact ? " is-compact" : ""}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Ask Runi about your training"
          title="Ask Runi"
        >
          <span className="ask-fab-mark"><BrandMark size={22} /></span>
          <span className="ask-fab-label">Ask Runi</span>
        </button>
      ) : null}
      {open ? <InsightsPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}
