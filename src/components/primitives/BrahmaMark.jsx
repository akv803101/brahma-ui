import React from 'react';

/**
 * Inline brand mark — three concentric arcs + a satellite dot, drawn with
 * `currentColor` so it inherits whatever color the parent sets.
 * Source SVG: public/assets/brahma-mark.svg
 */
export default function BrahmaMark({ size = 18, color = 'currentColor', style }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      style={{ color, flexShrink: 0, ...style }}
      aria-hidden
    >
      <path
        d="M 52 32 A 20 20 0 1 0 32 52"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 45 32 A 13 13 0 1 0 32 45"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M 38 32 A 6 6 0 1 0 32 38"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <circle cx="51" cy="13" r="3.2" fill="currentColor" />
    </svg>
  );
}
