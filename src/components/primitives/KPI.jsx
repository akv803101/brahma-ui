import React from 'react';
import { useCountUp, formatValue } from '../../theme/useTheme.js';

/**
 * Animated KPI card with the Brahma left-accent stripe.
 * `k` is one entry from a scenario's `kpis` array: { label, value, fmt, sub, unit? }.
 * `accent` overrides the stripe color (defaults to the theme's primary).
 */
export default function KPI({ k, theme, accent }) {
  const val = useCountUp(k.value, 1100, [k.label]);
  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 12,
        display: 'flex',
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
        boxShadow: theme.bg === '#0B1020' ? 'none' : '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ width: 4, background: accent || theme.primary }} />
      <div style={{ padding: '14px 18px', flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1,
            fontWeight: 700,
            color: theme.fg2,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {k.label}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: theme.fg,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.5,
            marginTop: 2,
            lineHeight: 1.05,
          }}
        >
          {formatValue(val, k.fmt)}
          {k.unit || ''}
        </div>
        <div
          style={{
            fontSize: 11,
            color: theme.fg2,
            marginTop: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {k.sub}
        </div>
      </div>
    </div>
  );
}
