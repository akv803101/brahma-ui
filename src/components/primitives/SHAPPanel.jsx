import React from 'react';

/**
 * Top-N feature contributions, animated bar chart.
 * Used on every Report layout. `features` is a scenario's `features` array.
 * For unsupervised problems the bars represent feature importance contributions
 * to cluster separation or anomaly score; the visual treatment is identical.
 */
export default function SHAPPanel({ features, theme, title = 'Top 8 features by mean(|SHAP value|)' }) {
  const max = Math.max(...features.map((f) => f.v));
  const isDark = theme.bg === '#0B1020';

  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 12,
        padding: '18px 20px',
        border: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: 700, color: theme.fg2 }}>
            EXPLAINABILITY · SHAP
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.fg, marginTop: 4 }}>
            {title}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {features.map((f, i) => (
          <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 24 }}>
            <div
              style={{
                width: 220,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: theme.fg,
                display: 'flex',
                gap: 10,
              }}
            >
              <span style={{ color: theme.fg3 }}>{String(i + 1).padStart(2, '0')}</span>
              {f.name}
            </div>
            <div
              style={{
                flex: 1,
                height: 8,
                background: isDark ? '#1F2937' : '#F3F4F6',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  width: `${(f.v / max) * 100}%`,
                  background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.primary} 60%, ${theme.deep} 100%)`,
                  transition: 'width .8s cubic-bezier(.2,.8,.2,1)',
                }}
              />
            </div>
            <div
              style={{
                width: 50,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: theme.fg2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {(f.v * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
