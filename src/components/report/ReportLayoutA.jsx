import React from 'react';
import { KPI, SHAPPanel } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import { PALETTES } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION A — metrics-first grid.
 * Order: Hero · KPI row · evaluation chart grid · feature importance.
 */
export default function ReportLayoutA({ scenario, theme, stageIdx }) {
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
