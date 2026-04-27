import React, { useEffect, useState } from 'react';
import { runsApi, useAuth } from '../../auth';
import { SCENARIOS } from '../../data/scenarios.js';
import { BrahmaMark, PulseDot } from '../primitives';

/**
 * Memory tab — Brahma's persistent run history.
 *
 * Top: stat panel (total runs, complete vs running, problem-type breakdown).
 * Body: list of run cards, sorted by started_at desc, with "Use as template"
 *       and "Open insights" actions.
 *
 * Filtering: scoped to the active workspace + project by default; the user
 * can broaden scope to "All projects in workspace" via the toggle.
 */
export default function MemoryScreen({ theme, onUseAsTemplate, onOpenInsights }) {
  const { currentWorkspace, currentProject } = useAuth();
  const [scope, setScope] = useState('project'); // 'project' | 'workspace'
  const [runs, setRuns] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    setRuns(null);
    setStats(null);
    setError(null);
    const params =
      scope === 'project' && currentProject?.id
        ? { projectId: currentProject.id }
        : { workspaceId: currentWorkspace.id };
    Promise.all([runsApi.recent({ ...params, limit: 50 }), runsApi.stats(params)])
      .then(([r, s]) => {
        if (cancelled) return;
        setRuns(r);
        setStats(s);
      })
      .catch((e) => !cancelled && setError(e.message || 'Failed to load memory.'));
    return () => {
      cancelled = true;
    };
  }, [scope, currentWorkspace?.id, currentProject?.id]);

  if (!currentWorkspace) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Header
        theme={theme}
        currentWorkspace={currentWorkspace}
        currentProject={currentProject}
        scope={scope}
        setScope={setScope}
      />

      {error && (
        <div
          style={{
            padding: '14px 18px',
            background: theme.bg === '#0B1020' ? '#7F1D1D33' : '#FEE2E2',
            color: theme.bg === '#0B1020' ? '#FCA5A5' : '#991B1B',
            borderRadius: 10,
            border: `1px solid ${theme.bg === '#0B1020' ? '#FCA5A555' : '#FCA5A5'}`,
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {error}
        </div>
      )}

      <StatsPanel theme={theme} stats={stats} loading={!stats && !error} />

      {runs === null && !error && <SkeletonRuns theme={theme} />}
      {runs !== null && runs.length === 0 && <EmptyState theme={theme} />}
      {runs !== null && runs.length > 0 && (
        <RunList
          theme={theme}
          runs={runs}
          onUseAsTemplate={onUseAsTemplate}
          onOpenInsights={onOpenInsights}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────

function Header({ theme, currentWorkspace, currentProject, scope, setScope }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BrahmaMark size={28} color={theme.primary} />
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
            Brahma Memory
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: theme.fg,
              letterSpacing: -0.4,
              margin: 0,
              marginTop: 2,
              lineHeight: 1.15,
            }}
          >
            What I've learned for{' '}
            <span style={{ color: theme.primary }}>{currentWorkspace.name}</span>.
          </h1>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'inline-flex',
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: theme.bg === '#0B1020' ? '#0B1020' : '#F3F4F6',
          border: `1px solid ${theme.border}`,
        }}
      >
        <ScopeBtn
          theme={theme}
          active={scope === 'project'}
          onClick={() => setScope('project')}
          disabled={!currentProject}
        >
          {currentProject?.name || 'No project'}
        </ScopeBtn>
        <ScopeBtn
          theme={theme}
          active={scope === 'workspace'}
          onClick={() => setScope('workspace')}
        >
          All in workspace
        </ScopeBtn>
      </div>
    </div>
  );
}

function ScopeBtn({ theme, active, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        border: 'none',
        background: active ? theme.primary : 'transparent',
        color: active ? '#fff' : theme.fg2,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'var(--font-sans)',
        letterSpacing: 0.2,
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stats panel
// ─────────────────────────────────────────────────────────────────────

function StatsPanel({ theme, stats, loading }) {
  const total = stats?.total_runs ?? 0;
  const complete = stats?.complete_count ?? 0;
  const running = stats?.running_count ?? 0;
  const lastCompleted = stats?.last_completed_at;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}
    >
      <Stat theme={theme} label="Total runs" value={loading ? '—' : String(total)} accent={theme.primary} />
      <Stat
        theme={theme}
        label="Completed"
        value={loading ? '—' : String(complete)}
        accent={theme.pos}
        sub={total ? `${Math.round((complete / total) * 100)}% of all` : ''}
      />
      <Stat
        theme={theme}
        label="In progress"
        value={loading ? '—' : String(running)}
        accent={theme.warn}
      />
      <Stat
        theme={theme}
        label="Last completion"
        value={
          loading
            ? '—'
            : lastCompleted
            ? formatRelative(lastCompleted)
            : 'No runs yet'
        }
        accent={theme.accent}
      />
    </div>
  );
}

function Stat({ theme, label, value, sub, accent }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderLeft: `4px solid ${accent || theme.primary}`,
        borderRadius: 12,
        padding: '14px 18px',
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
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: theme.fg,
          letterSpacing: -1,
          marginTop: 2,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: theme.fg2, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Run list
// ─────────────────────────────────────────────────────────────────────

function RunList({ theme, runs, onUseAsTemplate, onOpenInsights }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {runs.map((r, i) => (
        <RunRow
          key={r.id}
          theme={theme}
          run={r}
          first={i === 0}
          onUseAsTemplate={onUseAsTemplate}
          onOpenInsights={onOpenInsights}
        />
      ))}
    </div>
  );
}

function RunRow({ theme, run, first, onUseAsTemplate, onOpenInsights }) {
  const scenario = SCENARIOS[run.scenario_id];
  const isComplete = run.status === 'complete';
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr 200px 130px 200px',
        gap: 14,
        alignItems: 'center',
        padding: '14px 16px',
        borderTop: first ? 'none' : `1px solid ${theme.border}`,
        fontSize: 13,
      }}
    >
      <StatusDot theme={theme} status={run.status} />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: theme.fg,
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {scenario?.name || run.scenario_id}
          <span
            style={{
              fontSize: 10,
              letterSpacing: 1,
              fontWeight: 700,
              color: theme.fg3,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
            }}
          >
            {run.problem_type}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: theme.fg2,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {run.goal || '(no goal recorded)'}
        </div>
        <div
          style={{
            fontSize: 10,
            color: theme.fg3,
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 0.4,
          }}
        >
          run_{run.id} · {run.project_name || '(no project)'} · {run.started_by_name || '—'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontSize: 11,
            color: theme.fg3,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {run.primary_metric || '—'}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: isComplete ? theme.fg : theme.fg3,
            letterSpacing: -0.5,
          }}
        >
          {run.primary_value != null ? formatMetric(run.primary_metric, run.primary_value) : '—'}
        </div>
        {run.best_model && (
          <div style={{ fontSize: 11, color: theme.fg2, fontFamily: 'var(--font-mono)' }}>
            {run.best_model}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontSize: 11,
            color: theme.fg3,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          STARTED
        </div>
        <div style={{ fontSize: 12, color: theme.fg, fontFamily: 'var(--font-mono)' }}>
          {formatRelative(run.started_at)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <RowBtn
          theme={theme}
          onClick={() => onUseAsTemplate?.(run)}
          title="Reuse the same scenario for a fresh run"
        >
          Use as template
        </RowBtn>
        <RowBtn
          theme={theme}
          primary
          disabled={!isComplete}
          onClick={() => isComplete && onOpenInsights?.(run)}
          title={isComplete ? 'Open the insights deck' : 'Run must complete first'}
        >
          {isComplete ? 'Insights →' : 'Pending…'}
        </RowBtn>
      </div>
    </div>
  );
}

function StatusDot({ theme, status }) {
  if (status === 'complete') {
    return (
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: theme.pos,
          display: 'inline-block',
        }}
      />
    );
  }
  if (status === 'running') {
    return <PulseDot color={theme.primary} size={8} />;
  }
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: theme.fg3,
        display: 'inline-block',
        opacity: 0.5,
      }}
    />
  );
}

function RowBtn({ theme, onClick, primary, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${primary && !disabled ? theme.primary : theme.border}`,
        background: primary && !disabled ? theme.primary : 'transparent',
        color: primary && !disabled ? '#fff' : theme.fg2,
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'var(--font-sans)',
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty + skeleton states
// ─────────────────────────────────────────────────────────────────────

function EmptyState({ theme }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px dashed ${theme.border}`,
        borderRadius: 12,
        padding: '40px 24px',
        textAlign: 'center',
        color: theme.fg2,
      }}
    >
      <BrahmaMark size={36} color={theme.fg3} />
      <div
        style={{
          marginTop: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 2,
          color: theme.fg3,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        No runs in memory yet
      </div>
      <div style={{ marginTop: 8, fontSize: 14, color: theme.fg2, lineHeight: 1.5 }}>
        Finish a pipeline on the <b style={{ color: theme.fg }}>Connect</b> tab and it'll appear here.
      </div>
    </div>
  );
}

function SkeletonRuns({ theme }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 78,
            borderTop: i === 0 ? 'none' : `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: 16,
            opacity: 0.4,
          }}
        >
          <div
            style={{
              width: 120,
              height: 14,
              borderRadius: 4,
              background: theme.border,
              marginRight: 12,
            }}
          />
          <div style={{ flex: 1, height: 14, borderRadius: 4, background: theme.border }} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return 'just now';
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  if (dt < 604800) return `${Math.floor(dt / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatMetric(label = '', value) {
  if (value == null) return '—';
  if (label.includes('AUC')) return value.toFixed(4);
  if (label.includes('R²')) return value.toFixed(3);
  if (label.includes('MAPE')) return value.toFixed(1) + '%';
  if (label.includes('Silhouette')) return value.toFixed(2);
  if (label.includes('Contamination')) return value.toFixed(1) + '%';
  if (label.includes('MAE')) return '$' + value.toFixed(2);
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3);
}
