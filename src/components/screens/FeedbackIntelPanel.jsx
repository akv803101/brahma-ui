import React, { useEffect, useState, useCallback } from 'react';
import { feedbackApi, useAuth, ApiError } from '../../auth';
import { SCENARIOS } from '../../data/scenarios.js';

/**
 * Memory tab section: Brahma's intelligence over time.
 *
 * Shows for the current project:
 *   • model version + accuracy + corrections-since-calibration headline
 *   • by-tier breakdown bars (correct / incorrect)
 *   • recent corrections feed (with input preview)
 *   • recalibrate banner if threshold crossed
 *
 * Renders nothing if no project is selected.
 */
export default function FeedbackIntelPanel({ theme }) {
  const { currentProject } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [recalibrating, setRecalibrating] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentProject) return;
    setError(null);
    try {
      const s = await feedbackApi.stats({ projectId: currentProject.id });
      setStats(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load feedback stats.');
    }
  }, [currentProject?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const recalibrate = async () => {
    if (!currentProject) return;
    setRecalibrating(true);
    try {
      await feedbackApi.recalibrate(currentProject.id);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Recalibration failed.');
    } finally {
      setRecalibrating(false);
    }
  };

  if (!currentProject) return null;

  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <Header theme={theme} project={currentProject} stats={stats} />

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: theme.bg === '#0B1020' ? '#7F1D1D33' : '#FEE2E2',
            color: theme.bg === '#0B1020' ? '#FCA5A5' : '#991B1B',
            borderRadius: 8,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {error}
        </div>
      )}

      {!stats ? (
        <Skeleton theme={theme} />
      ) : stats.total === 0 ? (
        <Empty theme={theme} />
      ) : (
        <>
          {stats.retrain_recommended && (
            <RetrainBanner
              theme={theme}
              stats={stats}
              recalibrating={recalibrating}
              onRecalibrate={recalibrate}
            />
          )}
          <AccuracyHero theme={theme} stats={stats} />
          {Object.keys(stats.by_tier).length > 0 && (
            <ByTierSection theme={theme} byTier={stats.by_tier} />
          )}
          {stats.recent.length > 0 && (
            <RecentSection theme={theme} recent={stats.recent} />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function Header({ theme, project, stats }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.8,
            fontWeight: 700,
            color: theme.fg2,
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Brahma's intelligence loop
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: theme.fg,
            letterSpacing: -0.3,
            margin: 0,
            marginTop: 2,
            lineHeight: 1.15,
          }}
        >
          What I've learned from <span style={{ color: theme.primary }}>{project.name}</span>'s feedback.
        </h2>
      </div>
      <div style={{ flex: 1 }} />
      {stats && (
        <span
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            background: theme.bg === '#0B1020' ? '#1E3A8A33' : '#EFF6FF',
            color: theme.primary,
            fontSize: 11,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1.2,
          }}
        >
          MODEL {stats.model_version}
        </span>
      )}
    </div>
  );
}

function AccuracyHero({ theme, stats }) {
  const pct = (stats.accuracy * 100).toFixed(1);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
        gap: 12,
      }}
    >
      <Card
        theme={theme}
        accent={stats.accuracy >= 0.8 ? theme.pos : stats.accuracy >= 0.5 ? theme.warn : theme.neg}
        label="Accuracy from your feedback"
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 44,
            fontWeight: 800,
            color: theme.fg,
            letterSpacing: -1.5,
            lineHeight: 1.05,
          }}
        >
          {pct}%
        </div>
        <div style={{ fontSize: 11, color: theme.fg2, marginTop: 4 }}>
          across {stats.total} feedback{stats.total === 1 ? '' : 's'}
        </div>
      </Card>
      <Card theme={theme} accent={theme.pos} label="Correct">
        <div style={statStyle(theme)}>{stats.correct}</div>
        <div style={statSubStyle(theme)}>marked ✓ by humans</div>
      </Card>
      <Card theme={theme} accent={theme.neg} label="Wrong">
        <div style={statStyle(theme)}>{stats.incorrect}</div>
        <div style={statSubStyle(theme)}>corrected by humans</div>
      </Card>
      <Card theme={theme} accent={theme.accent} label="Since last recalibration">
        <div style={statStyle(theme)}>{stats.corrections_since_calibration}</div>
        <div style={statSubStyle(theme)}>of {stats.retrain_threshold} for next bump</div>
      </Card>
    </div>
  );
}

function statStyle(theme) {
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 26,
    fontWeight: 800,
    color: theme.fg,
    letterSpacing: -0.8,
    lineHeight: 1.05,
  };
}
function statSubStyle(theme) {
  return { fontSize: 11, color: theme.fg2, marginTop: 4 };
}

function Card({ theme, accent, label, children }) {
  return (
    <div
      style={{
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
        border: `1px solid ${theme.border}`,
        borderLeft: `4px solid ${accent || theme.primary}`,
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ByTierSection({ theme, byTier }) {
  const entries = Object.entries(byTier);
  return (
    <div>
      <SectionTitle theme={theme}>Per-tier breakdown · where Brahma is right and wrong</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {entries.map(([tier, b]) => {
          const total = b.correct + b.incorrect;
          const ratio = total ? b.correct / total : 0;
          return (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 110,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: theme.fg,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {tier}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: 999,
                  background: theme.bg === '#0B1020' ? '#1F2937' : '#F3F4F6',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    width: `${ratio * 100}%`,
                    background: theme.pos,
                    transition: 'width .25s',
                  }}
                />
                <div
                  style={{
                    width: `${(1 - ratio) * 100}%`,
                    background: theme.neg,
                    opacity: 0.85,
                    transition: 'width .25s',
                  }}
                />
              </div>
              <span
                style={{
                  width: 80,
                  textAlign: 'right',
                  fontSize: 11,
                  color: theme.fg2,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {b.correct}/{total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentSection({ theme, recent }) {
  return (
    <div>
      <SectionTitle theme={theme}>Recent feedback · most recent first</SectionTitle>
      <div
        style={{
          marginTop: 10,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {recent.map((r, i) => (
          <RecentRow key={r.id} theme={theme} row={r} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function RecentRow({ theme, row, first }) {
  const scenario = SCENARIOS[row.scenario_id];
  const isDark = theme.bg === '#0B1020';
  const tone = row.was_correct ? theme.pos : theme.neg;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr 1fr 90px 110px',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        borderTop: first ? 'none' : `1px solid ${theme.border}`,
        background: row.was_correct
          ? isDark
            ? '#14532D11'
            : '#F0FDF4'
          : isDark
          ? '#7F1D1D11'
          : '#FEF2F2',
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: tone,
          display: 'inline-block',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.fg }}>
          {scenario?.name || row.scenario_id}
        </div>
        <div
          style={{
            fontSize: 10,
            color: theme.fg2,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 0.4,
          }}
        >
          predicted {row.predicted_tier || '—'} · score {row.predicted_score.toFixed(3)}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: theme.fg2,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 0.4,
        }}
      >
        {row.was_correct ? '✓ correct' : `actual: ${row.actual_value || '—'}`}
      </div>
      <div
        style={{
          fontSize: 11,
          color: theme.fg2,
          fontFamily: 'var(--font-mono)',
          textAlign: 'right',
          letterSpacing: 0.4,
        }}
      >
        {row.model_version || '—'}
      </div>
      <div
        style={{
          fontSize: 11,
          color: theme.fg3,
          fontFamily: 'var(--font-mono)',
          textAlign: 'right',
        }}
      >
        {formatRelative(row.created_at)}
      </div>
    </div>
  );
}

function RetrainBanner({ theme, stats, recalibrating, onRecalibrate }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: theme.bg === '#0B1020' ? '#1E3A8A33' : '#EFF6FF',
        border: `1px solid ${theme.primary}55`,
        borderRadius: 10,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: theme.primary,
          boxShadow: `0 0 0 5px ${theme.primary}33`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: theme.primary,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {stats.corrections_since_calibration} corrections accumulated · ready to recalibrate
        </div>
        <div style={{ fontSize: 12, color: theme.fg2, marginTop: 2, lineHeight: 1.5 }}>
          Apply the human-in-the-loop signal. Brahma will roll {stats.model_version} forward to the next version.
        </div>
      </div>
      <button
        type="button"
        onClick={onRecalibrate}
        disabled={recalibrating}
        style={{
          padding: '9px 18px',
          borderRadius: 8,
          border: 'none',
          background: theme.primary,
          color: '#fff',
          fontSize: 13,
          fontWeight: 800,
          cursor: recalibrating ? 'not-allowed' : 'pointer',
          opacity: recalibrating ? 0.6 : 1,
          fontFamily: 'var(--font-sans)',
          letterSpacing: 0.3,
        }}
      >
        {recalibrating ? 'Recalibrating…' : 'Recalibrate Brahma →'}
      </button>
    </div>
  );
}

function SectionTitle({ theme, children }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: 1.5,
        fontWeight: 700,
        color: theme.fg2,
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </div>
  );
}

function Empty({ theme }) {
  return (
    <div
      style={{
        padding: '24px 22px',
        border: `1px dashed ${theme.border}`,
        borderRadius: 10,
        textAlign: 'center',
        color: theme.fg2,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1.5,
          color: theme.fg3,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        no human feedback yet
      </div>
      <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        Score a record on the <b style={{ color: theme.fg }}>Live Predict</b> tab and tell Brahma
        whether it got it right. Brahma's accuracy and recalibration cycle live here.
      </div>
    </div>
  );
}

function Skeleton({ theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.4 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 36,
            borderRadius: 8,
            background: theme.border,
          }}
        />
      ))}
    </div>
  );
}

function formatRelative(iso) {
  const t = new Date(iso).getTime();
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return 'just now';
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}
