import React from 'react';
import { PulseDot, BrahmaMark } from './primitives';
import { getStagesForScenario } from '../data/scenarios.js';
import { AvatarMenu } from './auth';

/**
 * macOS-style window chrome that wraps the entire app surface.
 * Three rows: title bar (traffic lights + centered scenario title + status),
 * tab bar (4 routes + slot for right-side accessories), and the body.
 *
 * Body padding is suppressed when on the Running screen because RunningScreen
 * provides its own internal padding.
 */
export default function BrahmaWindow({
  theme,
  scenario,
  screen,
  setScreen,
  stageIdx,
  rightAccessory,
  children,
}) {
  const stages = getStagesForScenario(scenario);
  const isDark = theme.bg === '#0B1020';
  const complete = stageIdx >= stages.length;

  const insightsAvailable = stageIdx >= stages.length;
  const tabs = [
    { id: 'connect',  label: 'Connect' },
    { id: 'running',  label: 'Running' },
    { id: 'report',   label: 'Report' },
    { id: 'insights', label: 'Insights', disabled: !insightsAvailable, hint: 'Available after the pipeline completes' },
    { id: 'live',     label: 'Live Predict' },
  ];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        background: theme.bg,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ─── Title bar ─────────────────────────────────────────────── */}
      <div
        style={{
          height: 42,
          flexShrink: 0,
          background: isDark ? '#111831' : '#F9FAFB',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={trafficLight('#ff5f57')} />
          <span style={trafficLight('#febc2e')} />
          <span style={trafficLight('#28c840')} />
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <BrahmaMark size={18} color={theme.primary} />
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.fg2, letterSpacing: 0.2 }}>
            Brahma — {scenario.name}
          </span>
          <span style={{ fontSize: 11, color: theme.fg3, fontFamily: 'var(--font-mono)' }}>
            · run_{Math.floor(Date.now() / 100000) % 100000}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PulseDot color={complete ? theme.pos : theme.primary} size={7} />
            <span style={{ fontSize: 11, color: theme.fg2, fontFamily: 'var(--font-mono)' }}>
              {complete ? 'complete' : 'running'}
            </span>
          </div>
          <AvatarMenu theme={theme} />
        </div>
      </div>

      {/* ─── Tab bar ───────────────────────────────────────────────── */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 4,
          padding: '0 14px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.surface,
        }}
      >
        {tabs.map((t) => {
          const active = t.id === screen;
          const disabled = !!t.disabled;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setScreen(t.id)}
              disabled={disabled}
              title={disabled ? t.hint : undefined}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: disabled ? theme.fg3 : active ? theme.primary : theme.fg2,
                borderBottom: `2px solid ${active ? theme.primary : 'transparent'}`,
                marginBottom: -1,
                fontFamily: 'var(--font-sans)',
                transition: 'color .15s',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {rightAccessory}
      </div>

      {/* ─── Body ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: screen === 'running' || screen === 'insights' ? 0 : '20px 24px',
          background: theme.bg,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function trafficLight(color) {
  return {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: color,
    display: 'inline-block',
  };
}
