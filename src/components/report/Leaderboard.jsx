import React from 'react';
import { formatValue } from '../../theme/useTheme.js';

/**
 * Model leaderboard — metric columns auto-switch by `scenario.problemType`.
 * The "winner" row is the one with the best primary metric (auto-detected),
 * marked with ★ and a "PICKED" pill — matches Brahma's Occam's-razor pattern.
 *
 * Per-type metric layout:
 *   classification / imbalanced → AUC, F1, PRECISION, RECALL          (max AUC wins)
 *   regression / forecast       → R², MAE                              (max R² wins)
 *   clustering                  → SILHOUETTE, DAVIES-BOULDIN           (max silhouette wins)
 *   anomaly                     → SCORE-AUC, CONTAM                    (max score wins)
 *   semisupervised              → AUC, COVERAGE                        (max AUC wins)
 */
export default function Leaderboard({ scenario, theme }) {
  const { columns, scoreOf } = layoutFor(scenario);

  const rows = scenario.models;
  const best = rows.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a), rows[0]);

  const isDark = theme.bg === '#0B1020';
  const isDummy = (name) => /^dummy|^seasonalnaive|labels only/i.test(name);

  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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
        {columns.map((c) => (
          <div key={c.label} style={{ width: 110, textAlign: 'right' }}>
            {c.label}
          </div>
        ))}
        <div style={{ width: 80, textAlign: 'right' }}>STATUS</div>
      </div>

      {/* Rows */}
      {rows.map((r) => {
        const winner = r === best;
        const dummy = isDummy(r.name);
        return (
          <div
            key={r.name}
            style={{
              display: 'flex',
              padding: '12px 16px',
              alignItems: 'center',
              background: winner ? (isDark ? '#14532D33' : '#F0FDF4') : 'transparent',
              color: dummy ? theme.fg3 : theme.fg,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: 14,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
              {winner && <span style={{ color: '#EAB308', fontSize: 16 }}>★</span>}
              <span style={{ fontWeight: winner ? 700 : 500 }}>{r.name}</span>
              {dummy && (
                <span
                  style={{
                    fontSize: 10,
                    color: theme.fg3,
                    padding: '2px 6px',
                    background: isDark ? '#1F2937' : '#F3F4F6',
                    borderRadius: 4,
                  }}
                >
                  baseline
                </span>
              )}
            </div>
            {columns.map((c) => (
              <div
                key={c.key}
                style={{
                  width: 110,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {r[c.key] == null ? '—' : c.format(r[c.key])}
              </div>
            ))}
            <div style={{ width: 80, textAlign: 'right' }}>
              {winner ? (
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

// ────────────────────────────────────────────────────────────────────────
// Per-problem-type column + ranking config
// ────────────────────────────────────────────────────────────────────────

function col(label, key, fmt) {
  return { label, key, format: (v) => formatValue(v, fmt) };
}

function pctCol(label, key) {
  return { label, key, format: (v) => (v * 100).toFixed(1) + '%' };
}

function layoutFor(scenario) {
  switch (scenario.problemType) {
    case 'regression':
    case 'forecast':
      return {
        columns: [col('R²', 'r2', '0.000'), col('MAE', 'mae', '0.00')],
        scoreOf: (r) => r.r2 ?? -Infinity,
      };

    case 'clustering':
      return {
        columns: [col('SILHOUETTE', 'silhouette', '0.00'), col('DAVIES-BOULDIN', 'db', '0.00')],
        scoreOf: (r) => r.silhouette ?? -Infinity,
      };

    case 'anomaly':
      return {
        columns: [col('SCORE-AUC', 'score', '0.000'), pctCol('CONTAM', 'contam')],
        scoreOf: (r) => r.score ?? -Infinity,
      };

    case 'semisupervised':
      return {
        columns: [col('AUC', 'auc', '0.000'), pctCol('COVERAGE', 'coverage')],
        scoreOf: (r) => r.auc ?? -Infinity,
      };

    case 'imbalanced':
    case 'classification':
    default:
      return {
        columns: [
          col('AUC', 'auc', '0.0000'),
          col('F1', 'f1', '0.000'),
          col('PRECISION', 'prec', '0.000'),
          col('RECALL', 'rec', '0.000'),
        ],
        scoreOf: (r) => r.auc ?? -Infinity,
      };
  }
}
