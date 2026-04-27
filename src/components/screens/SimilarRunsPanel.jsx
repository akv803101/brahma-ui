import React, { useEffect, useState } from 'react';
import { runsApi } from '../../auth';
import { SCENARIOS } from '../../data/scenarios.js';

/**
 * Connect-screen helper: when the user has typed a goal of >= 12 chars,
 * call /api/runs/similar and surface up to 3 past runs with the same
 * shape. "Use this run's setup" pre-loads the matching scenario.
 *
 * Renders nothing if there are no similar runs or the input is too short.
 */
export default function SimilarRunsPanel({ goal, theme, onUseTemplate }) {
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = (goal || '').trim();
    if (trimmed.length < 12) {
      setSimilar([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      runsApi
        .similar(trimmed, 3)
        .then((rows) => {
          if (cancelled) return;
          // Keep only completed runs — those have a real metric to show
          setSimilar((rows || []).filter((r) => r.status === 'complete' || r.status === 'running'));
        })
        .catch(() => !cancelled && setSimilar([]))
        .finally(() => !cancelled && setLoading(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [goal]);

  if (!similar.length && !loading) return null;

  return (
    <div
      style={{
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: theme.primary,
            display: 'inline-block',
          }}
        />
        Brahma remembers similar work
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: theme.fg3, fontFamily: 'var(--font-mono)' }}>
          Searching memory…
        </div>
      )}

      {similar.map((r) => {
        const scenario = SCENARIOS[r.scenario_id];
        return (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: theme.card,
              border: `1px solid ${theme.border}`,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.fg, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                {scenario?.name || r.scenario_id}
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.2,
                    fontWeight: 700,
                    color: theme.fg3,
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.problem_type}
                </span>
                {r.status === 'complete' && r.primary_metric && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: theme.pos,
                      letterSpacing: 0.4,
                    }}
                  >
                    {r.primary_metric} {formatMetric(r.primary_metric, r.primary_value)}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: theme.fg2,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.goal || '(no goal recorded)'}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: theme.fg3,
                  fontFamily: 'var(--font-mono)',
                  marginTop: 2,
                  letterSpacing: 0.4,
                }}
              >
                {r.project_name || '(no project)'} · {r.started_by_name} · {formatRelative(r.started_at)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUseTemplate?.(r)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${theme.primary}`,
                background: 'transparent',
                color: theme.primary,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                letterSpacing: 0.3,
                whiteSpace: 'nowrap',
              }}
            >
              Use this setup
            </button>
          </div>
        );
      })}
    </div>
  );
}

function formatRelative(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return 'just now';
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}

function formatMetric(label = '', value) {
  if (value == null) return '—';
  if (label.includes('AUC')) return value.toFixed(4);
  if (label.includes('R²')) return value.toFixed(3);
  if (label.includes('MAPE')) return value.toFixed(1) + '%';
  if (label.includes('Silhouette')) return value.toFixed(2);
  if (label.includes('Contamination')) return value.toFixed(1) + '%';
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3);
}
