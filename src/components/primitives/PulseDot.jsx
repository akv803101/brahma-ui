import React from 'react';

/**
 * Pulsing stage dot — the running-stage indicator on the Running screen and elsewhere.
 * The outer ring grows + fades to 0 every 1.4s, the inner dot stays static.
 * Animation keyframe `brahmaPulse` lives in tokens.css.
 */
export default function PulseDot({ color, size = 8 }) {
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: -2,
          borderRadius: 999,
          background: color,
          opacity: 0.4,
          animation: 'brahmaPulse 1.4s ease-out infinite',
        }}
      />
    </span>
  );
}
