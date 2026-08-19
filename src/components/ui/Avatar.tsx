"use client";

/**
 * The athlete's photo, everywhere.
 *
 * ## Why one component
 *
 * There were five: the dashboard's `ImageSlot`, the activity page's inline
 * `<img>`, the coach roster's row, the athlete detail header, and Settings' own
 * `Avatar`. Each fell back differently when there was no photo — one to a file
 * that does not exist in `public/`, one to a blue smiley, one to bare initials
 * with no circle around them, one to the literal word "Photo". So the same
 * account looked like four different people depending on the screen.
 *
 * ## The framing
 *
 * `object-position` is gone. The stored image is now a square crop produced by
 * `AvatarEditor` — see the long note there for why moving a `cover` image
 * inside a square box could only ever pan one axis, which is what made the old
 * editor feel frozen. A square inside a square needs no framing rule, so this
 * component has none, and the two cannot disagree.
 *
 * Older rows hold a full-proportion photo. `cover` centres those, which is the
 * same thing every other product does and is never wrong-looking — just not
 * chosen. Re-saving a photo in Settings replaces it with a real crop.
 */

import { useEffect, useState } from "react";

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  src,
  name,
  size,
  /** click opens a larger view — see `Lightbox` */
  zoomable = false,
  ring = true,
}: {
  src: string | null | undefined;
  name?: string | null;
  size: number;
  zoomable?: boolean;
  ring?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  const circle = (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flex: "none",
        borderRadius: "50%",
        overflow: "hidden",
        background: "var(--color-elevated)",
        border: ring ? "1px solid var(--color-line-strong)" : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise
        <img
          src={src as string}
          alt={name ? `${name}'s photo` : ""}
          draggable={false}
          // A photo that cannot be decoded must not leave a broken-image icon.
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span
          className="num"
          aria-hidden={!name}
          style={{
            // Scales with the circle so the initials look deliberate at 32px
            // and at 116px, rather than like text that failed to become a photo.
            fontSize: `${Math.max(9, Math.round(size * 0.36))}px`,
            fontWeight: 500,
            letterSpacing: ".02em",
            color: "var(--color-muted)",
            userSelect: "none",
          }}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  );

  if (!zoomable || !showImage) return circle;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `Enlarge ${name}'s photo` : "Enlarge photo"}
        style={{
          padding: 0,
          border: "none",
          background: "none",
          cursor: "zoom-in",
          borderRadius: "50%",
          display: "block",
          lineHeight: 0,
        }}
      >
        {circle}
      </button>
      {open ? <Lightbox src={src as string} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * The enlarged photo.
 *
 * Deliberately not a `<dialog>` and deliberately not a browser modal: this has
 * to close on Escape, on a backdrop click, and on the button, and it must never
 * block the page if something goes wrong. A plain fixed overlay does all three
 * and can always be dismissed.
 */
function Lightbox({
  src,
  name,
  onClose,
}: {
  src: string;
  name?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name}'s photo` : "Photo"}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(6, 8, 12, .82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        cursor: "zoom-out",
      }}
    >
      <figure
        onClick={(e) => e.stopPropagation()}
        style={{
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          cursor: "default",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL */}
        <img
          src={src}
          alt={name ? `${name}'s photo` : "Photo"}
          style={{
            width: "min(72vw, 420px)",
            height: "min(72vw, 420px)",
            objectFit: "cover",
            borderRadius: "50%",
            border: "1px solid var(--color-line-strong)",
            boxShadow: "0 24px 80px rgba(0,0,0,.6)",
            display: "block",
          }}
        />
        {name ? (
          <figcaption style={{ fontSize: "13px", color: "var(--color-ink)" }}>{name}</figcaption>
        ) : null}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onClose}
          style={{ padding: "6px 14px", fontSize: "12px" }}
        >
          Close
        </button>
      </figure>
    </div>
  );
}
