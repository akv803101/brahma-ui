import React, { useState } from 'react';
import PulseDot from './primitives/PulseDot.jsx';
import { PALETTES } from '../theme/useTheme.js';
import { SCENARIOS, getStagesForScenario } from '../data/scenarios.js';

/**
 * Floating dev widget — fixed bottom-right.
 * Two states:
 *   - **expanded**: full panel with scenario picker, layout, color, dark mode,
 *     pipeline stage slider
 *   - **collapsed**: a single pill chip with summary text
 *
 * Auto-collapses 280 ms after any change so it doesn't get in the way.
 * Always rendered with the dark surface palette regardless of the app's
 * dark/light mode — it's a tool overlay, not part of the surface.
 */
export default function TweaksPanel({ state, setState }) {
  const [expanded, setExpanded] = useState(true);

  const change = (patch) => {
    setState(patch);
    setTimeout(() => setExpanded(false), 280);
  };

  const scenario = SCENARIOS[state.scenario];
  const stages = scenario ? getStagesForScenario(scenario) : [];

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 1000,
          background: '#111831',
          color: '#E5E7EB',
          border: '1px solid #1F2937',
          borderRadius: 999,
          padding: '10px 16px 10px 12px',
          cursor: 'pointer',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        <PulseDot color="#60A5FA" size={7} />
        <span>TWEAKS</span>
        <span style={{ color: '#9CA3AF', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
          {scenario?.name.split(' ')[0]} · {state.layout} · {state.primaryColor}
          {state.dark ? ' · dark' : ''}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 300,
        zIndex: 1000,
        background: '#111831',
        color: '#E5E7EB',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06)',
        padding: '16px 18px',
        fontFamily: 'var(--font-sans)',
        border: '1px solid #1F2937',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <PulseDot color="#60A5FA" size={7} />
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: 800,
            color: '#9CA3AF',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          Tweaks
        </div>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>

      <Row label="Scenario">
        <select
          value={state.scenario}
          onChange={(e) => change({ scenario: e.target.value })}
          style={selectStyle}
        >
          {Object.values(SCENARIOS).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.problemType})
            </option>
          ))}
        </select>
      </Row>

      <Row label="Report layout">
        <div style={{ display: 'flex', gap: 4 }}>
          {['A', 'B', 'C'].map((k) => (
            <button
              key={k}
              onClick={() => change({ layout: k })}
              style={{
                flex: 1,
                padding: '6px 0',
                border: '1px solid #2A3553',
                background: state.layout === k ? '#2563EB' : 'transparent',
                color: state.layout === k ? '#fff' : '#9CA3AF',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Primary color">
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.entries(PALETTES).map(([k, p]) => (
            <button
              key={k}
              onClick={() => change({ primaryColor: k })}
              style={{
                flex: 1,
                padding: '6px 0',
                border: state.primaryColor === k ? '1px solid #fff' : '1px solid #2A3553',
                background: p.primary,
                color: '#fff',
                textTransform: 'capitalize',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Dark mode">
        <Switch on={state.dark} onChange={() => change({ dark: !state.dark })} />
      </Row>

      <Row label={`Pipeline stage · ${state.stageIdx}/${stages.length}`}>
        <input
          type="range"
          min={0}
          max={stages.length}
          step={1}
          value={state.stageIdx}
          onChange={(e) => setState({ stageIdx: parseInt(e.target.value, 10) })}
          style={{ width: '100%', accentColor: '#60A5FA' }}
        />
        <div
          style={{
            fontSize: 10,
            color: '#6B7280',
            marginTop: 2,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {state.stageIdx === 0
            ? 'idle'
            : state.stageIdx >= stages.length
            ? 'complete'
            : stages[state.stageIdx - 1]?.name}
        </div>
      </Row>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function Switch({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      aria-pressed={on}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        position: 'relative',
        background: on ? '#2563EB' : '#2A3553',
        border: 'none',
        cursor: 'pointer',
        transition: 'background .2s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: '#fff',
          transition: 'left .2s',
        }}
      />
    </button>
  );
}

const selectStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  background: '#0B1020',
  color: '#E5E7EB',
  border: '1px solid #2A3553',
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  outline: 'none',
};
