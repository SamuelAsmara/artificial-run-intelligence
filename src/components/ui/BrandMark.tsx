import { useId } from "react";

/**
 * Kit item — the Runi mark.
 *
 * The R is the runner: standing leg as the stem, curling arm as the bowl,
 * head above, and the blue stride is the R's leg with two speed lines behind
 * it. Drawn inline rather than loaded as an image so it stays crisp at any
 * size, costs no request, and can take its accent from the theme token.
 *
 * The silver gradient needs an id, and ids must be unique per document —
 * `useId` namespaces it so two marks on one page (or one in a portal) never
 * fight over the same `<defs>`.
 *
 * Per the logo package's own guidance: below 16px the speed lines become
 * noise, so they switch off.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  const id = useId();
  const g = `runi-sil-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2f5f9" />
          <stop offset="55%" stopColor="#c8d2df" />
          <stop offset="100%" stopColor="#8f9cae" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${g})`} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M26 84V26" />
        <path d="M26 26c18-8 36-2 36 12 0 11-10 16-22 16H30" />
      </g>
      <circle cx="70" cy="14" r="8" fill={`url(#${g})`} />
      <path d="M34 52h12c13 8 22 19 30 32-16-11-31-16-47-18l5-14Z" fill="var(--color-accent)" />
      {size >= 16 ? (
        <g stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" opacity=".45">
          <path d="M4 36h12" />
          <path d="M0 50h10" />
        </g>
      ) : null}
    </svg>
  );
}
