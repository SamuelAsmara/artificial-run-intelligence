"use client";

import * as React from "react";

/**
 * The athlete's photo.
 *
 * Photo upload is not built yet, so this looks for a file the developer can
 * drop in themselves — `public/avatar.jpg` — and falls back to the prototype's
 * placeholder when it isn't there. No code change is needed to swap the image:
 * add or remove the file.
 *
 * When real upload lands this becomes a `src` prop fed from the profile row,
 * and the fallback stays for athletes who never set one.
 */
const PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='264' height='264' viewBox='0 0 264 264'%3E%3Crect width='264' height='264' fill='%231b1f27'/%3E%3Ccircle cx='132' cy='132' r='88' fill='none' stroke='%234e8ef7' stroke-width='8'/%3E%3Ccircle cx='103' cy='114' r='10' fill='%234e8ef7'/%3E%3Ccircle cx='161' cy='114' r='10' fill='%234e8ef7'/%3E%3Cpath d='M96 152 Q132 184 168 152' fill='none' stroke='%234e8ef7' stroke-width='8' stroke-linecap='round'/%3E%3C/svg%3E";

/** Drop a file here and it appears. Nothing else to change. */
const LOCAL_AVATAR = "/avatar.jpg";

/**
 * How the photo is framed inside the circle.
 *
 * `cover` crops to fill, and by default it crops around the geometric centre —
 * which cuts foreheads off portraits, because a face sits above the middle of
 * most photos. Biasing upward fixes the common case. Tune this one value if
 * your photo needs it: first number horizontal, second vertical, where 0% is
 * the top of the image.
 */
const AVATAR_POSITION = "50% 30%";

export function ImageSlot({
  style,
  label,
  src,
  objectPosition,
}: {
  style?: React.CSSProperties;
  label?: string;
  /** overrides the local file, for when profiles carry a photo url */
  src?: string | null;
  /** override the framing for one instance, e.g. "50% 20%" */
  objectPosition?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? LOCAL_AVATAR}
      alt={label ?? ""}
      // A missing file must not leave a broken-image icon on the dashboard.
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== PLACEHOLDER_SRC) img.src = PLACEHOLDER_SRC;
      }}
      style={{
        borderRadius: "50%",
        objectFit: "cover",
        objectPosition: objectPosition ?? AVATAR_POSITION,
        display: "block",
        ...style,
      }}
    />
  );
}
