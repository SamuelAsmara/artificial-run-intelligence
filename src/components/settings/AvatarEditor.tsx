"use client";

/**
 * Choosing a photo and framing it inside the circle.
 *
 * ## Why this was rewritten
 *
 * The previous version stored the whole photo plus an `object-position`, and
 * let you drag that position around. It felt frozen, and it was: `object-fit:
 * cover` only leaves something to pan along the axis where the image *overflows
 * its box*. Every photo from a phone is a portrait, so inside a square circle it
 * overflows vertically and not at all horizontally — dragging sideways did
 * literally nothing, and dragging up and down ran out after a centimetre. There
 * was no bug to find in the drag handler; the mechanism could not do the job.
 *
 * ## What it does instead
 *
 * Pan **and zoom** over the source, and what gets saved is a **square crop** of
 * exactly what you see in the circle. Zooming is what creates room to pan: at
 * 1.4× a portrait overflows in both directions, so both axes move.
 *
 * Storing the crop rather than the original also removes a whole class of
 * disagreement. Every screen that shows an avatar puts a square image in a
 * square box, so there is no framing rule left to get wrong, and `Avatar` needs
 * no position prop. `profiles.avatar_position` stays in the schema for the rows
 * written before this, and stops being consulted.
 *
 * ## Why the browser does the work
 *
 * A file from a phone is three or four megabytes and the circle is 116 pixels
 * across. Decoding, cropping and re-encoding happen here, so what reaches the
 * server is tens of kilobytes and a large photo cannot fail the save.
 */

import { useCallback, useRef, useState } from "react";

/** The saved crop, in pixels. Square, because every box that shows it is. */
const OUTPUT_PX = 512;
/** JPEG quality. 0.82 is where further loss starts to show on skin. */
const OUTPUT_QUALITY = 0.82;
/**
 * The longest side we keep of the *source*.
 *
 * Big enough that zooming in stays sharp, small enough that holding it in
 * component state costs nothing.
 */
const SOURCE_PX = 1400;

const PREVIEW_PX = 216;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Kept for callers that still pass a position; no longer used for framing. */
export const DEFAULT_POSITION = "50% 50%";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Decodes a chosen file and bounds its longest side, preserving proportions. */
async function toSource(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > SOURCE_PX ? SOURCE_PX / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function AvatarEditor({
  src,
  onChange,
}: {
  /** the currently saved avatar — already a square crop, or null */
  src: string | null;
  /** called with the new square crop; null when cleared */
  onChange: (next: { src: string | null; position: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The image being framed, at full proportions.
   *
   * Separate from `src`, which is the *result*. Cropping a crop on every
   * adjustment would soften the photo a little more each time; keeping the
   * source means every drag re-cuts from the same original.
   */
  const [source, setSource] = useState<string | null>(src);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /**
   * An already-saved avatar becomes the source, so it can be re-framed — at
   * mount, and again whenever the saved avatar changes while nothing is being
   * framed (the form was reset, say). Adjusting state from a changed prop
   * during render, rather than in an effect, so the frame never shows a stale
   * intermediate render.
   */
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    if (src && !source) setSource(src);
  }

  /** Preview pixels per source pixel, at the current zoom. */
  const scaleFor = useCallback(
    (n: { w: number; h: number }, z: number) => (PREVIEW_PX / Math.min(n.w, n.h)) * z,
    [],
  );

  /** How far the image may be moved before it stops covering the circle. */
  const limits = useCallback(
    (n: { w: number; h: number }, z: number) => {
      const s = scaleFor(n, z);
      return {
        x: Math.max(0, (n.w * s - PREVIEW_PX) / 2),
        y: Math.max(0, (n.h * s - PREVIEW_PX) / 2),
      };
    },
    [scaleFor],
  );

  /**
   * Cuts the square the circle is showing, and hands it up.
   *
   * Called when a gesture *ends* rather than on every pointer move: encoding a
   * 512px JPEG on each frame would make the drag stutter, and the parent only
   * needs the result when the athlete has finished choosing it.
   */
  const commit = useCallback(
    (n: { w: number; h: number }, z: number, off: { x: number; y: number }) => {
      const img = imgRef.current;
      if (!img || !img.complete) return;

      const s = scaleFor(n, z);
      // The centre of the circle, in source pixels.
      const cx = n.w / 2 - off.x / s;
      const cy = n.h / 2 - off.y / s;
      const side = PREVIEW_PX / s;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_PX;
      canvas.height = OUTPUT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        clamp(cx - side / 2, 0, Math.max(0, n.w - side)),
        clamp(cy - side / 2, 0, Math.max(0, n.h - side)),
        side,
        side,
        0,
        0,
        OUTPUT_PX,
        OUTPUT_PX,
      );
      onChange({ src: canvas.toDataURL("image/jpeg", OUTPUT_QUALITY), position: DEFAULT_POSITION });
    },
    [onChange, scaleFor],
  );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That file isn't an image.");
    setError(null);
    setBusy(true);
    try {
      const next = await toSource(file);
      setSource(next);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setNatural(null); // onLoad re-measures and commits
    } catch {
      setError("Could not read that image. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
    }
  };

  /* --- pan --- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (!source || !natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start || !natural) return;
    const lim = limits(natural, zoom);
    setOffset({
      x: clamp(start.ox + (e.clientX - start.x), -lim.x, lim.x),
      y: clamp(start.oy + (e.clientY - start.y), -lim.y, lim.y),
    });
  };

  const endDrag = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    if (natural) commit(natural, zoom, offset);
  };

  const onZoom = (next: number) => {
    if (!natural) return;
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const lim = limits(natural, z);
    const off = { x: clamp(offset.x, -lim.x, lim.x), y: clamp(offset.y, -lim.y, lim.y) };
    setZoom(z);
    setOffset(off);
    commit(natural, z, off);
  };

  const displayed = natural
    ? { w: natural.w * scaleFor(natural, zoom), h: natural.h * scaleFor(natural, zoom) }
    : null;

  /** True once the photo is big enough to move in both directions. */
  const canPanBoth = natural ? limits(natural, zoom).x > 1 && limits(natural, zoom).y > 1 : false;

  return (
    <div style={{ display: "flex", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: "none" }}>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={dragging ? onPointerMove : undefined}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={source ? "Drag to move · use the slider to zoom" : undefined}
          style={{
            position: "relative",
            width: `${PREVIEW_PX}px`,
            height: `${PREVIEW_PX}px`,
            borderRadius: "50%",
            overflow: "hidden",
            border: `2px ${source ? "solid" : "dashed"} var(--color-line-strong)`,
            background: "var(--color-surface)",
            cursor: source ? (dragging ? "grabbing" : "grab") : "default",
            touchAction: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {source ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL
            <img
              ref={imgRef}
              src={source}
              alt="Your photo"
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                const n = { w: el.naturalWidth, h: el.naturalHeight };
                setNatural(n);
                // A freshly chosen photo is saved centred straight away, so
                // "Choose a photo" then "Save" works without touching anything.
                if (!src) commit(n, 1, { x: 0, y: 0 });
              }}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: displayed ? `${displayed.w}px` : "100%",
                height: displayed ? `${displayed.h}px` : "100%",
                maxWidth: "none",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                userSelect: "none",
                display: "block",
              }}
            />
          ) : (
            <span className="num" style={{ fontSize: "11px", color: "var(--color-faint)" }}>
              no photo
            </span>
          )}
        </div>

        {source ? (
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>−</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              onChange={(e) => onZoom(Number(e.target.value))}
              aria-label="Zoom"
              style={{ flex: 1, accentColor: "var(--color-accent)" }}
            />
            <span className="num" style={{ fontSize: "10px", color: "var(--color-faint)" }}>+</span>
          </label>
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)", textWrap: "pretty", lineHeight: 1.6 }}>
          {!source
            ? "Choose a photo from your computer. It is resized and cropped in your browser before it is saved."
            : canPanBoth
              ? "Drag the photo to choose what sits inside the circle. The circle is exactly what gets saved."
              : "Zoom in to move the photo freely — at the smallest size it already fits one way."}
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
            {busy ? "Reading…" : source ? "Choose another" : "Choose a photo"}
          </button>

          {source && (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                  if (natural) commit(natural, 1, { x: 0, y: 0 });
                }}
                style={{ padding: "7px 13px", fontSize: "12px" }}
              >
                Recentre
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setSource(null);
                  setNatural(null);
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                  onChange({ src: null, position: DEFAULT_POSITION });
                }}
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
