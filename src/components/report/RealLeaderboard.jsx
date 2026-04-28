import React from 'react';

/**
 * Real-mode leaderboard — schema-agnostic. Reads whatever columns the
 * engine produced in leaderboard.csv (auc, f1, r2, mae, silhouette, …)
 * and picks the winner from a known priority order of metrics.
 *
 * Numeric values are formatted to 4 decimals; rank-1 row wears the
 * PICKED pill. Rows lacking the primary metric fall back to the
 * available column.
 */
const PRIMARY_METRICS = [
  'auc', 'roc_auc', 'pr_auc', 'f1',
  'r2', 'rmse',
  'silhouette',
  'score', 'score_auc',
];

const HIDE_COLUMNS = new Set([
  'model', 'name', 'rank', 'picked', 'is_winner', 'winner', 'is_picked',
]);

export default function RealLeaderboard({ rows, theme }) {
  if (!rows?.length) {
    return (
      <div style={emptyStyle(theme)}>
        Leaderboard not available for this run.
      </div>
    );
  }

  const nameKey = pickKey(rows[0], ['model', 'name']);
  const primaryMetric = PRIMARY_METRICS.find((m) => m in rows[0]) || nonHiddenNumeric(rows[0]);
  const numericColumns = Object.keys(rows[0])
    .filter((k) => !HIDE_COLUMNS.has(k.toLowerCase()) && k !== nameKey && typeof rows[0][k] === 'number');

  const sortedRows = [...rows].sort((a, b) => {
    const av = a[primaryMetric] ?? -Infinity;
    const bv = b[primaryMetric] ?? -Infinity;
    return bv - av; // higher = better
  });
  const winner = sortedRows[0];

  const isDark = theme.bg === '#0B1020';

  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          padding: '10px 16px',
          background: isDark ? '#1F2937' : '#F9FAFB',
          fontSize: 10,
          fontWeight: 700,
          color: theme.fg2,
          letterSpacing: 1,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ flex: 2 }}>MODEL</div>
        {numericColumns.map((c) => (
          <div key={c} style={{ width: 110, textAlign: 'right' }}>
            {c.toUpperCase()}
            {c === primaryMetric && <span style={{ color: theme.primary, marginLeft: 4 }}>★</span>}
          </div>
        ))}
        <div style={{ width: 80, textAlign: 'right' }}>STATUS</div>
      </div>

      {sortedRows.map((r, i) => {
        const isWinner = r === winner;
        return (
          <div
            key={(r[nameKey] ?? `row-${i}`) + '-' + i}
            style={{
              display: 'flex',
              padding: '12px 16px',
              alignItems: 'center',
              background: isWinner ? (isDark ? '#14532D33' : '#F0FDF4') : 'transparent',
              color: theme.fg,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
              {isWinner && <span style={{ color: '#EAB308', fontSize: 16 }}>★</span>}
              <span style={{ fontWeight: isWinner ? 700 : 500 }}>{r[nameKey] ?? `row ${i + 1}`}</span>
            </div>
            {numericColumns.map((c) => (
              <div
                key={c}
                style={{
                  width: 110,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: c === primaryMetric ? theme.fg : theme.fg2,
                }}
              >
                {formatNum(r[c])}
              </div>
            ))}
            <div style={{ width: 80, textAlign: 'right' }}>
              {isWinner ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: theme.pos,
                    background: isDark ? '#14532D' : '#DCFCE7',
                    padding: '3px 8px',
                    borderRadius: 999,
                    letterSpacing: 0.5,
                  }}
                >
                  PICKED
                </span>
              ) : (
                <span style={{ color: theme.fg3 }}>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function emptyStyle(theme) {
  return {
    padding: '14px 18px',
    border: `1px dashed ${theme.border}`,
    borderRadius: 12,
    color: theme.fg3,
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  };
}

function pickKey(obj, candidates) {
  for (const k of candidates) if (k in obj) return k;
  return Object.keys(obj)[0];
}

function nonHiddenNumeric(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (HIDE_COLUMNS.has(k.toLowerCase())) continue;
    if (typeof v === 'number') return k;
  }
  return Object.keys(obj)[0];
}

function formatNum(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
