import React, { useState, useEffect, useRef } from 'react';
import PulseDot from '../primitives/PulseDot.jsx';
import { CheckIcon } from '../primitives/Icons.jsx';
import { LOG_FRAGMENTS, getStagesForScenario } from '../../data/scenarios.js';

/**
 * Running screen — live pipeline view with two columns:
 *   LEFT  · stage list with done/run/wait status
 *   RIGHT · streaming terminal log
 *
 * `stageIdx` is 0..stages.length. Hosts increment it (the demo wall and
 * Phase 6 shell drive it from a tweaks state). The `LOG_FRAGMENTS` array
 * supplies ambient log noise; we add 1–2 lines per stage advance.
 */
export default function RunningScreen({ scenario, theme, stageIdx, onComplete }) {
  const stages = getStagesForScenario(scenario);
  const [logLines, setLogLines] = useState([]);
  const prevStage = useRef(stageIdx);
  const idRef = useRef(0);

  useEffect(() => {
    // Reset the log when the scenario changes (different stage set)
    setLogLines([]);
    prevStage.current = 0;
    idRef.current = 0;
  }, [scenario.id]);

  useEffect(() => {
    if (stageIdx > prevStage.current) {
      const added = stageIdx - prevStage.current;
      const newLines = [];
      for (let i = 0; i < added * 2; i++) {
        const idx = ((stageIdx - 1) * 2 + i) % LOG_FRAGMENTS.length;
        const frag = LOG_FRAGMENTS[Math.min(idx, LOG_FRAGMENTS.length - 1)];
        newLines.push({ id: idRef.current++, ts: timestamp(), parts: frag });
      }
      setLogLines((ls) => [...ls, ...newLines].slice(-22));
    }
    prevStage.current = stageIdx;
    if (stageIdx >= stages.length && onComplete) onComplete();
  }, [stageIdx, stages.length, onComplete]);

  const current = Math.min(stageIdx, stages.length - 1);
  const isDark = theme.bg === '#0B1020';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        gap: 16,
        padding: '20px 24px',
        height: '100%',
      }}
    >
      {/* LEFT · Pipeline list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <PulseDot color={theme.primary} />
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: 700,
              color: theme.fg2,
              textTransform: 'uppercase',
            }}
          >
            Brahma is running · {scenario.name.toLowerCase()}
          </div>
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: theme.fg,
            letterSpacing: -0.3,
            lineHeight: 1.25,
            marginBottom: 10,
          }}
        >
          {scenario.goal}
        </div>
        <div
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            overflow: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {stages.map((s, i) => {
            const done = i < stageIdx;
            const running = i === stageIdx && stageIdx < stages.length;
            const waiting = i > stageIdx;
            const statusColor = done ? theme.pos : running ? theme.primary : theme.fg3;
            return (
              <div
                key={s.n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  borderBottom: i < stages.length - 1 ? `1px solid ${theme.border}` : 'none',
                  background: running ? (isDark ? '#1E3A8A22' : `${theme.primary}08`) : 'transparent',
                  transition: 'background .25s ease',
                }}
              >
                <div style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                  {done && <CheckIcon color={theme.pos} />}
                  {running && <PulseDot color={theme.primary} size={8} />}
                  {waiting && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: theme.fg3,
                        opacity: 0.4,
                        display: 'inline-block',
                      }}
                    />
                  )}
                </div>
                <span style={{ color: theme.fg3, width: 22, fontSize: 11 }}>{s.n}</span>
                <span
                  style={{
                    flex: 1,
                    color: waiting ? theme.fg3 : theme.fg,
                    fontWeight: running ? 700 : 500,
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    color: statusColor,
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: 1,
                  }}
                >
                  {done ? 'DONE' : running ? 'RUN' : 'WAIT'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT · Streaming log */}
      <div
        style={{
          background: isDark ? '#050912' : '#0B1020',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid ${isDark ? '#1F2937' : 'transparent'}`,
        }}
      >
        <div
          style={{
            padding: '10px 16px',
            background: '#111831',
            borderBottom: '1px solid #1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
            ))}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#9CA3AF',
              fontFamily: 'var(--font-mono)',
              marginLeft: 8,
            }}
          >
            brahma · live execution log
          </div>
          <div style={{ flex: 1 }} />
          <PulseDot color="#4ADE80" size={7} />
          <span style={{ fontSize: 11, color: '#4ADE80', fontFamily: 'var(--font-mono)' }}>live</span>
        </div>
        <div
          style={{
            padding: '14px 18px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            color: '#E5E7EB',
            lineHeight: 1.75,
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div>
            {logLines.map((l) => (
              <div
                key={l.id}
                style={{ animation: 'brahmaLogIn .3s ease-out', whiteSpace: 'pre-wrap' }}
              >
                <span style={{ color: '#4B5563' }}>{l.ts} </span>
                {l.parts.map(([kind, txt], j) => (
                  <span
                    key={j}
                    style={{
                      color:
                        kind === 'dim' ? '#A78BFA' : kind === 'ok' ? '#4ADE80' : '#E5E7EB',
                    }}
                  >
                    {txt}
                  </span>
                ))}
              </div>
            ))}
            {stageIdx < stages.length && (
              <div style={{ marginTop: 4 }}>
                <span style={{ color: '#60A5FA' }}>› </span>
                <span style={{ color: '#E5E7EB' }}>{stages[current].detail}</span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 14,
                    background: '#E5E7EB',
                    verticalAlign: 'middle',
                    marginLeft: 3,
                    animation: 'brahmaBlink 1s steps(2) infinite',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function timestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
