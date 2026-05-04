import React from 'react';

/**
 * Reusable sections for real-engine reports. The three Layout variants
 * (A/B/C) all compose these — they only differ in arrangement.
 *
 * Inputs are the raw report payload from /api/pipelines/{id}/report:
 *   { mode, goal, narrative, leaderboard: [...], charts: [...], runId }
 */

export function SectionTitle({ theme, children }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        color: theme.fg2,
        textTransform: 'uppercase',
        margin: '10px 0 0',
      }}
    >
      {children}
    </h2>
  );
}

export function RealReportHero({ goal, report, theme, accent = 'compact' }) {
  const winner = pickWinner(report.leaderboard || []);
  const big = accent === 'finding';
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: big ? '32px 36px' : '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: big ? 14 : 8,
      }}
    >
      <div
        style={{
          fontSize: big ? 11 : 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: big ? theme.primary : theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        {big ? 'The finding' : `Run report · ${report.charts?.length || 0} charts · ${report.leaderboard?.length || 0} models`}
      </div>
      <div
        style={{
          fontSize: big ? 30 : 22,
          fontWeight: 800,
          color: theme.fg,
          letterSpacing: big ? -0.7 : -0.3,
          lineHeight: 1.18,
        }}
      >
        {goal}
      </div>
      {winner && (
        <div
          style={{
            display: 'flex',
            gap: big ? 24 : 18,
            flexWrap: 'wrap',
            fontSize: big ? 14 : 13,
            fontFamily: 'var(--font-mono)',
            color: theme.fg2,
            marginTop: big ? 8 : 0,
          }}
        >
          <span>
            <span style={{ color: theme.fg3 }}>winner: </span>
            <span style={{ color: theme.fg, fontWeight: 700 }}>{winner.model || winner.name}</span>
          </span>
          {Object.entries(winner)
            .filter(([k, v]) => typeof v === 'number' && k !== 'rank')
            .slice(0, 4)
            .map(([k, v]) => (
              <span key={k}>
                <span style={{ color: theme.fg3 }}>{k}: </span>
                <span style={{ color: theme.fg, fontWeight: 600 }}>{formatNum(v)}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

export function NarrativeSection({ narrative, theme, maxHeight = 360 }) {
  if (!narrative) return null;
  return (
    <pre
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '14px 18px',
        margin: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: 1.65,
        color: theme.fg,
        whiteSpace: 'pre-wrap',
        maxHeight,
        overflow: 'auto',
      }}
    >
      {narrative}
    </pre>
  );
}

export function pickWinner(rows) {
  if (!rows.length) return null;
  const primary = ['auc', 'roc_auc', 'pr_auc', 'f1', 'r2', 'silhouette'].find((k) => k in rows[0]);
  if (!primary) return rows[0];
  return rows.reduce((a, b) => ((b[primary] ?? -Infinity) > (a[primary] ?? -Infinity) ? b : a));
}

export function formatNum(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return String(v ?? '—');
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
