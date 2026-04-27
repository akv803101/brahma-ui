import React from 'react';
import { SHAPPanel } from '../primitives';
import HeroBanner from './HeroBanner.jsx';
import ProblemCharts from './ProblemCharts.jsx';
import { formatValue } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * VARIATION B — narrative-first.
 * The hero finding gets a panel of its own; the chart grid is anchored to it.
 * Order: Hero · finding panel (headline + narrative + 3 inline KPIs + chart grid) · SHAP.
 */
export default function ReportLayoutB({ scenario, theme, stageIdx }) {
  const stages = getStagesForScenario(scenario);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <HeroBanner
        scenario={scenario}
        theme={theme}
        stageIdx={stageIdx}
        totalStages={stages.length}
      />

      <div
        style={{
          background: theme.card,
          borderRadius: 16,
          padding: '32px 36px',
          border: `1px solid ${theme.border}`,
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 40,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: theme.primary,
            }}
          >
            THE FINDING
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: theme.fg,
              letterSpacing: -0.7,
              lineHeight: 1.15,
              marginTop: 10,
            }}
          >
            {scenario.headline}
          </div>
          <div
            style={{
              fontSize: 14,
              color: theme.fg2,
              lineHeight: 1.65,
              marginTop: 16,
              maxWidth: 480,
            }}
          >
            {scenario.narrative}
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 22, flexWrap: 'wrap' }}>
            {scenario.kpis.slice(0, 3).map((k) => (
              <div key={k.label}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: 700,
                    color: theme.fg2,
                    textTransform: 'uppercase',
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: theme.fg,
                    marginTop: 2,
                    letterSpacing: -0.5,
                  }}
                >
                  {formatValue(k.value, k.fmt)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minHeight: 220 }}>
          <ProblemCharts scenario={scenario} theme={theme} />
        </div>
      </div>

      <SectionTitle theme={theme}>What drives the prediction</SectionTitle>
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
