import React from 'react';
import PulseDot from '../primitives/PulseDot.jsx';
import { formatValue } from '../../theme/useTheme.js';
import { getStagesForScenario } from '../../data/scenarios.js';

/**
 * Gradient hero banner — anchors every Report layout.
 * Shows: scenario goal, dataset/agent line, and a status badge that
 * either reads "STAGE n/N" (running) or "TEST SCORE = …" (complete).
 *
 * The brahma-mark-white SVG floats at low opacity in the bottom-right
 * as a watermark — design-system pattern.
 */
export default function HeroBanner({ scenario, theme, stageIdx, totalStages }) {
  const stages = getStagesForScenario(scenario);
  const total = totalStages ?? stages.length;
  const pct = Math.round((stageIdx / total) * 100);
  const complete = stageIdx >= total;
  const isDark = theme.bg === '#0B1020';

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '26px 30px',
        background: theme.gradient,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        boxShadow: `0 18px 40px ${isDark ? 'rgba(0,0,0,.4)' : 'rgba(37,99,235,.25)'}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {complete ? 'PIPELINE · COMPLETE' : 'PIPELINE · RUNNING'}
          {!complete && <PulseDot color="#A7F3D0" />}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: -0.5,
            marginTop: 6,
            lineHeight: 1.15,
            maxWidth: 560,
          }}
        >
          {scenario.goal}
        </div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9, fontFamily: 'var(--font-mono)' }}>
          {scenario.dataset} · {scenario.dataSize} · routed to{' '}
          <b style={{ color: '#fff' }}>{scenario.agent}</b>
        </div>
      </div>

      <div
        style={{
          textAlign: 'right',
          padding: '0 0 0 28px',
          borderLeft: '1px solid rgba(255,255,255,.25)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 700, opacity: 0.85 }}>
          {complete ? 'TEST SCORE' : `STAGE ${stageIdx}/${total}`}
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: -1,
            marginTop: 2,
            lineHeight: 1,
          }}
        >
          {complete
            ? formatValue(scenario.kpis[0].value, scenario.kpis[0].fmt)
            : pct + '%'}
        </div>
        <div style={{ fontSize: 12, color: '#A7F3D0', fontWeight: 600, marginTop: 4 }}>
          {complete
            ? scenario.finalModel
            : stages[Math.min(stageIdx, stages.length - 1)]?.name}
        </div>
      </div>

      <img
        src="/assets/brahma-mark-white.svg"
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          right: -40,
          bottom: -50,
          width: 220,
          opacity: 0.1,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
