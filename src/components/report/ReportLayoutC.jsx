import React from 'react';
import { KPI } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import ChartGrid from './ChartGrid.jsx';
import Leaderboard from './Leaderboard.jsx';
import RealLeaderboard from './RealLeaderboard.jsx';
import { RealReportHero, NarrativeSection, SectionTitle, pickWinner } from './RealReportSections.jsx';
import { PALETTES } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION C — leaderboard-forward.
 *
 * Real:  hero → leaderboard → Occam-style commentary → chart grid → narrative
 * Mock:  hero → KPI row → leaderboard → commentary → ProblemCharts
 */
export default function ReportLayoutC({ scenario, theme, stageIdx, report, runId }) {
  if (report?.mode === 'real') {
    const winner = pickWinner(report.leaderboard || []);
    const total = report.leaderboard?.length || 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <RealReportHero goal={report.goal} report={report} theme={theme} />

        <SectionTitle theme={theme}>
          Model leaderboard · {total} candidate{total === 1 ? '' : 's'} evaluated
        </SectionTitle>
        <RealLeaderboard rows={report.leaderboard || []} theme={theme} />

        {winner && (
          <div
            style={{
              background: theme.card,
              borderRadius: 12,
              padding: '16px 20px',
              border: `1px solid ${theme.border}`,
              fontSize: 13,
              color: theme.fg2,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: theme.fg }}>Brahma picked</b>{' '}
            <span style={{ color: theme.fg, fontFamily: 'var(--font-mono)' }}>
              {winner.model || winner.name}
            </span>{' '}
            from {total} candidates. Selection prefers the simplest model whose primary
            metric falls within tolerance of the best — Occam's razor applied across the
            leaderboard.
          </div>
        )}

        <SectionTitle theme={theme}>
          Evaluation charts · {report.charts?.length || 0} produced
        </SectionTitle>
        <ChartGrid charts={report.charts || []} runId={runId} theme={theme} />

        {report.narrative && (
          <>
            <SectionTitle theme={theme}>Reasoning</SectionTitle>
            <NarrativeSection narrative={report.narrative} theme={theme} />
          </>
        )}
      </div>
    );
  }
  return <MockReportLayoutC scenario={scenario} theme={theme} stageIdx={stageIdx} />;
}

function MockReportLayoutC({ scenario, theme, stageIdx }) {
  const stages = getStagesForScenario(scenario);
  const accents = [theme.primary, PALETTES.purple.primary, theme.pos, theme.warn];
  const candidateNoun =
    scenario.problemType === 'clustering' || scenario.problemType === 'anomaly'
      ? 'algorithms'
      : 'models';

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
        {candidateNoun === 'algorithms' ? 'Algorithm' : 'Model'} leaderboard ·{' '}
        {scenario.models.length} evaluated on held-out test set
      </SectionTitle>
      <Leaderboard scenario={scenario} theme={theme} />

      <div
        style={{
          background: theme.card,
          borderRadius: 12,
          padding: '16px 20px',
          border: `1px solid ${theme.border}`,
          fontSize: 13,
          color: theme.fg2,
          lineHeight: 1.6,
        }}
      >
        <b style={{ color: theme.fg }}>Occam's razor, applied:</b>{' '}
        {scenario.finalModel} leads the leaderboard without meaningful complexity penalty.
        CV gap is within tolerance and the top three candidates are within noise. Brahma
        selected the simpler parameterisation.
      </div>

      <SectionTitle theme={theme}>Evaluation charts</SectionTitle>
      <ProblemCharts scenario={scenario} theme={theme} />
    </div>
  );
}
