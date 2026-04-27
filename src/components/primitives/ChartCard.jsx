import React from 'react';

/**
 * Card wrapper used around every Chart. Title + subtitle header, fixed-height body.
 * The body slot is sized in pixels so SVG charts have a stable aspect ratio.
 */
export default function ChartCard({ title, subtitle, theme, children, height = 180 }) {
  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.fg }}>{title}</div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: theme.fg2,
              fontFamily: 'var(--font-mono)',
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: 14, height }}>{children}</div>
    </div>
  );
}
