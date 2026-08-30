"use client";

/**
 * The dashboard's opening moment, in one mountable component.
 *
 * On mount it stamps the nearest page root as `entering`, hands every card a
 * staggered delay in DOM order, and flips to `entered` on the next frame —
 * the CSS in globals.css does the actual animating. It then runs two touches
 * of arithmetic theatre: large numerals count up from zero to their real
 * value, and any long chart stroke draws itself in. Both read their targets
 * from the DOM, so nothing here can show a number the page did not already
 * contain.
 *
 * Respects `prefers-reduced-motion` by doing nothing at all: the class never
 * lands, the numbers stay printed, the strokes stay drawn.
 */

import { useEffect, useRef } from "react";

export function Entrance() {
  const ref = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = ref.current?.closest<HTMLElement>("[data-entrance-root]") ?? document.body;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".card"));
    cards.forEach((c, i) => c.style.setProperty("--enter-delay", `${Math.min(i, 14) * 0.08}s`));
    root.classList.add("entering");

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        root.classList.add("entered");
        root.classList.remove("entering");
      }),
    );

    /* count-up on the large numerals */
    const t0 = performance.now();
    const DUR = 700;
    root.querySelectorAll<HTMLElement>("span.num, p.num").forEach((el) => {
      if (el.children.length > 0) return;
      const raw = el.textContent?.trim() ?? "";
      if (!/^[+]?\d+(\.\d+)?$/.test(raw)) return;
      if (parseFloat(getComputedStyle(el).fontSize) < 20) return;
      const target = parseFloat(raw);
      const plus = raw.startsWith("+");
      const decimals = (raw.split(".")[1] ?? "").length;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / DUR);
        const eased = 1 - Math.pow(1 - p, 2);
        el.textContent = (plus ? "+" : "") + (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = raw;
      };
      requestAnimationFrame(tick);
    });

    /* long strokes draw themselves in */
    root.querySelectorAll<SVGPathElement>(".card svg path[stroke]").forEach((path, i) => {
      let len: number;
      try {
        len = path.getTotalLength();
      } catch {
        return;
      }
      if (!len || len < 60) return;
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      void path.getBoundingClientRect();
      path.style.transition = `stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1) ${0.25 + i * 0.03}s`;
      path.style.strokeDashoffset = "0";
      const clear = () => {
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
        path.style.transition = "";
        path.removeEventListener("transitionend", clear);
      };
      path.addEventListener("transitionend", clear);
    });
  }, []);

  return <span ref={ref} hidden aria-hidden />;
}
