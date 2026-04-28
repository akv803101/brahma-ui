import React from 'react';
import { KPI, SHAPPanel } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import ChartGrid from './ChartGrid.jsx';
import RealLeaderboard from './RealLeaderboard.jsx';
import { PALETTES } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION A — metrics-first grid.
 *
 * Two modes:
 *   real (report prop set) — render engine charts + leaderboard from /report
 *   mock (no report)        — legacy scenario-driven KPIs + ProblemCharts grid
 */
export default function ReportLayoutA({ scenario, theme, stageIdx, report, runId }) {
  if (report?.mode === 'real') {
    return <RealReportLayoutA report={report} runId={runId} theme={theme} />;
  }
  return <MockReportLayoutA scenario={scenario} theme={theme} stageIdx={stageIdx} />;
}

function RealReportLayoutA({ report, runId, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RealHero goal={report.goal} report={report} theme={theme} />

      <SectionTitle theme={theme}>Leaderboard</SectionTitle>
      <RealLeaderboard rows={report.leaderboard || []} theme={theme} />

      {report.narrative && (
        <>
          <SectionTitle theme={theme}>Narrative</SectionTitle>
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
              maxHeight: 360,
              overflow: 'auto',
            }}
          >
            {report.narrative}
          </pre>
        </>
      )}

      <SectionTitle theme={theme}>
        Charts · {report.charts?.length || 0} produced by Brahma
      </SectionTitle>
      <ChartGrid charts={report.charts || []} runId={runId} theme={theme} />
    </div>
  );
}

function RealHero({ goal, report, theme }) {
  const winner = pickWinner(report.leaderboard || []);
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        Run report · {report.charts?.length || 0} charts · {report.leaderboard?.length || 0} models
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: theme.fg,
          letterSpacing: -0.3,
          lineHeight: 1.25,
        }}
      >
        {goal}
      </div>
      {winner && (
        <div
          style={{
            display: 'flex',
            gap: 18,
            flexWrap: 'wrap',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            color: theme.fg2,
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

function MockReportLayoutA({ scenario, theme, stageIdx }) {
  const stages = getStagesForScenario(scenario);
  const accents = [theme.primary, PALETTES.purple.primary, theme.pos, theme.warn];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HeroBanner
        scenario={scenario}
        theme={theme}
        stageIdx={stageIdx}
        totalStages={stages.length}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {scenario.kpis.map((k, i) => (
          <KPI key={k.label} k={k} theme={theme} accent={accents[i % accents.length]} />
        ))}
      </div>

      <SectionTitle theme={theme}>
        Evaluation charts · problem type: {scenario.problemType}
      </SectionTitle>
      <ProblemCharts scenario={scenario} theme={theme} />

      <SectionTitle theme={theme}>Feature importance</SectionTitle>
      <SHAPPanel features={scenario.features} theme={theme} />
    </div>
  );
}

function SectionTitle({ theme, children }) {
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

function pickWinner(rows) {
  if (!rows.length) return null;
  const primary = ['auc', 'roc_auc', 'pr_auc', 'f1', 'r2', 'silhouette'].find((k) => k in rows[0]);
  if (!primary) return rows[0];
  return rows.reduce((a, b) => ((b[primary] ?? -Infinity) > (a[primary] ?? -Infinity) ? b : a));
}

function formatNum(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return String(v ?? '—');
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
