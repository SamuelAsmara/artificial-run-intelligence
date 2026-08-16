import * as React from "react";

/**
 * Stand-in for the prototype's droppable image slot.
 * Renders the placeholder avatar until real photo upload exists.
 */
const AVATAR_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='264' height='264' viewBox='0 0 264 264'%3E%3Crect width='264' height='264' fill='%231b1f27'/%3E%3Ccircle cx='132' cy='132' r='88' fill='none' stroke='%234e8ef7' stroke-width='8'/%3E%3Ccircle cx='103' cy='114' r='10' fill='%234e8ef7'/%3E%3Ccircle cx='161' cy='114' r='10' fill='%234e8ef7'/%3E%3Cpath d='M96 152 Q132 184 168 152' fill='none' stroke='%234e8ef7' stroke-width='8' stroke-linecap='round'/%3E%3C/svg%3E";

export function ImageSlot({
  style,
  label,
}: {
  style?: React.CSSProperties;
  label?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={AVATAR_SRC}
      alt={label ?? ""}
      style={{ borderRadius: "50%", objectFit: "cover", display: "block", ...style }}
    />
  );
}
