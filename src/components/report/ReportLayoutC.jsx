import React from 'react';
import { KPI } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import Leaderboard from './Leaderboard.jsx';
import { PALETTES } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION C — leaderboard-forward.
 * The candidate-model table is the star, framed by KPIs above and an
 * Occam's-razor commentary card below.
 * Order: Hero · KPI row · leaderboard · commentary · evaluation charts.
 */
export default function ReportLayoutC({ scenario, theme, stageIdx }) {
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
