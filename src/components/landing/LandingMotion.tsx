"use client";

/**
 * Scroll-triggered motion for the landing page, in one mountable component.
 *
 * Three things, all read from the DOM so nothing here can show a value the
 * page did not already contain:
 *
 * - `[data-reveal]` groups get the class `in` when they enter the viewport
 *   (top 85%). The CSS in globals.css fades their children up with an 80ms
 *   stagger — the numbers the design engine gave us for a scroll reveal:
 *   400–600ms, y 24px, ease-out, no more than ~8 staggered children.
 * - `[data-count]` numerals count up from zero to their printed value the
 *   first time their group is revealed (700ms, quad-out).
 * - `[data-draw] path[stroke]` strokes draw themselves in on reveal.
 *
 * Under prefers-reduced-motion everything is stamped `in` immediately and no
 * counting or drawing happens: the page simply appears, complete.
 */

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (groups.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      groups.forEach((g) => g.classList.add("in"));
      return;
    }

    const countUp = (el: HTMLElement) => {
      const raw = el.textContent?.trim() ?? "";
      if (!/^\d+(\.\d+)?$/.test(raw)) return;
      const target = parseFloat(raw);
      const decimals = (raw.split(".")[1] ?? "").length;
      const t0 = performance.now();
      const DUR = 700;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / DUR);
        const eased = 1 - Math.pow(1 - p, 2);
        el.textContent = (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = raw;
      };
      requestAnimationFrame(tick);
    };

    const draw = (root: HTMLElement) => {
      root.querySelectorAll<SVGPathElement>("path[stroke]").forEach((path, i) => {
        let len: number;
        try { len = path.getTotalLength(); } catch { return; }
        if (!len || len < 20) return;
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        void path.getBoundingClientRect();
        path.style.transition = `stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1) ${0.15 + i * 0.08}s`;
        path.style.strokeDashoffset = "0";
        const clear = () => {
          path.style.strokeDasharray = "";
          path.style.strokeDashoffset = "";
          path.style.transition = "";
          path.removeEventListener("transitionend", clear);
        };
        path.addEventListener("transitionend", clear);
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const g = e.target as HTMLElement;
          g.classList.add("in");
          g.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
          g.querySelectorAll<HTMLElement>("[data-draw]").forEach(draw);
          io.unobserve(g);
        });
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    groups.forEach((g) => io.observe(g));
    return () => io.disconnect();
  }, []);

  return null;
}
