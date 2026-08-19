"use client";

/**
 * Choosing a photo and framing it inside the circle.
 *
 * Two problems the placeholder never had to solve.
 *
 * **Getting a photo in.** A file from the athlete's computer is typically two
 * or three megabytes; the circle it lands in is 116 pixels across. So the
 * browser downscales and re-encodes before anything is sent — the server never
 * receives the original, which keeps the payload in the tens of kilobytes and
 * means a large photo cannot fail the save.
 *
 * **Framing it.** A round crop keeps the middle of the image, and on most
 * portraits the middle is a chin. Dragging the preview moves the crop, so the
 * athlete places their own face rather than accepting whatever `cover` chose.
 * What we store is the resulting `object-position`, not a new image, so the
 * framing stays adjustable forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The longest side of the stored image.
 *
 * Deliberately *not* a square. The previous version centre-cropped to 400×400,
 * and every place the avatar is shown renders it in a square box with
 * `object-fit: cover` — so with matching aspect ratios there was no overflow
 * for `object-position` to move, and the "drag to reframe" control did
 * precisely nothing while still storing a position that could never matter.
 *
 * Keeping the original proportions is what makes the framing real: a portrait
 * photo overflows a square box vertically, and dragging chooses which part of
 * it you see.
 */
const OUTPUT_PX = 512;
/** JPEG quality. 0.82 is the point where further loss starts to show on skin. */
const OUTPUT_QUALITY = 0.82;

const PREVIEW_PX = 132;

export const DEFAULT_POSITION = "50% 30%";

/**
 * Downscales and re-encodes a chosen file, entirely in the browser.
 *
 * Proportions are preserved — see OUTPUT_PX. A very wide or very tall image is
 * still bounded on its longest side, so the stored data URL stays small.
 */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > OUTPUT_PX ? OUTPUT_PX / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
}

function parsePosition(position: string): { x: number; y: number } {
  const [x, y] = position.split(" ").map((p) => Number.parseFloat(p));
  return {
    x: Number.isFinite(x) ? x : 50,
    y: Number.isFinite(y) ? y : 30,
  };
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function AvatarEditor({
  src,
  position,
  onChange,
}: {
  src: string | null;
  position: string;
  /** called with the new image and framing; image is null when cleared */
  onChange: (next: { src: string | null; position: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const pos = parsePosition(position);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onChange({ src: await toDataUrl(file), position: DEFAULT_POSITION });
    } catch {
      setError("Could not read that image. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
    }
  };

  /* --- dragging to reposition --- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (!src) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    setDragging(true);
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current;
      if (!start || !src) return;
      // Dragging right should move the image right, which means revealing more
      // of its left side — hence the subtraction.
      const nextX = clamp(start.px - ((e.clientX - start.x) / PREVIEW_PX) * 100);
      const nextY = clamp(start.py - ((e.clientY - start.y) / PREVIEW_PX) * 100);
      onChange({ src, position: `${Math.round(nextX)}% ${Math.round(nextY)}%` });
    },
    [onChange, pos.x, pos.y, src],
  );

  const endDrag = () => {
    dragStart.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (!dragging) return;
    const stop = () => endDrag();
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [dragging]);

  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={dragging ? onPointerMove : undefined}
        onPointerUp={endDrag}
        title={src ? "Drag to move the photo inside the circle" : undefined}
        style={{
          width: `${PREVIEW_PX}px`,
          height: `${PREVIEW_PX}px`,
          borderRadius: "50%",
          overflow: "hidden",
          flex: "none",
          border: `2px ${src ? "solid" : "dashed"} var(--color-line-strong)`,
          background: "var(--color-surface)",
          cursor: src ? (dragging ? "grabbing" : "grab") : "default",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Your photo"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${pos.x}% ${pos.y}%`,
              userSelect: "none",
            }}
          />
        ) : (
          <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
            no photo
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty" }}>
          {src
            ? "Drag the photo to choose what sits inside the circle."
            : "Choose a photo from your computer. It is resized in your browser before it is saved."}
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => void pick(e.target.files?.[0])}
          style={{ display: "none" }}
        />

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            style={{ padding: "7px 13px", fontSize: "12px" }}
          >
            {busy ? "Resizing…" : src ? "Choose another" : "Choose a photo"}
          </button>

          {src && (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onChange({ src, position: DEFAULT_POSITION })}
                style={{ padding: "7px 13px", fontSize: "12px" }}
              >
                Recentre
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onChange({ src: null, position: DEFAULT_POSITION })}
                style={{ padding: "7px 13px", fontSize: "12px", color: "var(--color-negative)" }}
              >
                Remove
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="num" style={{ margin: 0, fontSize: "11.5px", color: "var(--color-negative)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
