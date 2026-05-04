import React from 'react';
import { KPI, SHAPPanel } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import ChartGrid from './ChartGrid.jsx';
import RealLeaderboard from './RealLeaderboard.jsx';
import { RealReportHero, NarrativeSection, SectionTitle } from './RealReportSections.jsx';
import { PALETTES } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION A — metrics-first grid.
 *
 * Real:  hero → leaderboard → narrative → chart grid
 * Mock:  hero → KPI row → ProblemCharts → SHAP
 */
export default function ReportLayoutA({ scenario, theme, stageIdx, report, runId }) {
  if (report?.mode === 'real') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <RealReportHero goal={report.goal} report={report} theme={theme} />
        <SectionTitle theme={theme}>Leaderboard</SectionTitle>
        <RealLeaderboard rows={report.leaderboard || []} theme={theme} />
        {report.narrative && (
          <>
            <SectionTitle theme={theme}>Narrative</SectionTitle>
            <NarrativeSection narrative={report.narrative} theme={theme} />
          </>
        )}
        <SectionTitle theme={theme}>
          Charts · {report.charts?.length || 0} produced by Brahma
        </SectionTitle>
        <ChartGrid charts={report.charts || []} runId={runId} theme={theme} />
      </div>
    );
  }
  return <MockReportLayoutA scenario={scenario} theme={theme} stageIdx={stageIdx} />;
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
