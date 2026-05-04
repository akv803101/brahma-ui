import React, { useState, useEffect, useRef } from 'react';
import PulseDot from '../primitives/PulseDot.jsx';
import { CheckIcon } from '../primitives/Icons.jsx';
import { LOG_FRAGMENTS, getStagesForScenario } from '../../data/scenarios.js';

/**
 * Running screen — live pipeline view with two columns:
 *   LEFT  · stage list with done/run/wait status
 *   RIGHT · streaming terminal log (Claude narrative when real, mock fragments otherwise)
 *
 * Two modes:
 *   real  — `runId` is set; reads from `stream` prop (G4: hook lives in
 *           BrahmaShell so log buffer + EventSource survive nav).
 *   mock  — `runId` is null; legacy scenario auto-advance (back-compat for demos).
 */
export default function RunningScreen({ scenario, theme, stageIdx, runId, stream, onComplete }) {
  if (runId && stream) {
    return <RealRunning scenario={scenario} theme={theme} runId={runId} stream={stream} />;
  }
  return <MockRunning scenario={scenario} theme={theme} stageIdx={stageIdx} onComplete={onComplete} />;
}

function RealRunning({ scenario, theme, runId, stream }) {
  const isDark = theme.bg === '#0B1020';

  // G2 — re-render every 500ms while any stage is running so the live
  // elapsed-time badge ticks up. We track a counter to force the render
  // (the actual time delta comes from Date.now() - stage.startedAt).
  const [tick, setTick] = useState(0);
  const anyRunning = stream.stages.some((s) => s.status === 'running');
  useEffect(() => {
    if (!anyRunning) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [anyRunning]);

  // Display stages: prefer real stream stages once they arrive; fall back to
  // scenario stages so the UI isn't empty during the connecting phase.
  const fallbackStages = getStagesForScenario(scenario);
  const now = Date.now(); // captured per render so live badges update with `tick`
  const stages = stream.stages.length
    ? stream.stages.map((s, i) => {
        let liveElapsed = null;
        if (s.status === 'running' && s.startedAt) {
          liveElapsed = (now - s.startedAt) / 1000;
        }
        return {
          n: String(i + 1).padStart(2, '0'),
          name: s.label || fallbackStages[i]?.name || `Stage ${i + 1}`,
          status: s.status,
          elapsedS: s.elapsedS,
          liveElapsedS: liveElapsed,
        };
      })
    : fallbackStages.map((s) => ({ n: s.n, name: s.name, status: 'pending', elapsedS: null, liveElapsedS: null }));
  // Reference `tick` so React knows this render depends on it
  void tick;

  const failedAt = stream.failedStage;
  const statusLabel = failedAt
    ? `failed at stage ${String(failedAt.index + 1).padStart(2, '0')} · ${failedAt.label}`
    : stream.status === 'connecting'
      ? 'connecting…'
      : stream.status === 'streaming'
      ? `running · ${stages.filter((s) => s.status === 'done').length}/${stages.length}`
      : stream.status === 'complete'
      ? 'complete'
      : stream.status === 'error'
      ? 'error'
      : 'idle';

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
          <PulseDot color={(stream.status === 'error' || failedAt) ? theme.neg : theme.primary} />
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: 700,
              color: theme.fg2,
              textTransform: 'uppercase',
            }}
          >
            Brahma engine · {statusLabel}
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
        {stream.error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: `${theme.neg}15`,
              border: `1px solid ${theme.neg}55`,
              color: theme.neg,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              marginBottom: 6,
            }}
          >
            {stream.error}
          </div>
        )}
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
            const done = s.status === 'done';
            const running = s.status === 'running';
            const failed = s.status === 'failed';
            const statusColor = failed
              ? theme.neg
              : done
              ? theme.pos
              : running
              ? theme.primary
              : theme.fg3;
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
                  {!done && !running && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: failed ? theme.neg : theme.fg3,
                        opacity: failed ? 0.9 : 0.4,
                        display: 'inline-block',
                      }}
                    />
                  )}
                </div>
                <span style={{ color: theme.fg3, width: 22, fontSize: 11 }}>{s.n}</span>
                <span
                  style={{
                    flex: 1,
                    color: !done && !running ? theme.fg3 : theme.fg,
                    fontWeight: running ? 700 : 500,
                  }}
                >
                  {s.name}
                </span>
                {s.elapsedS != null && (
                  <span style={{ color: theme.fg3, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                    {s.elapsedS.toFixed(1)}s
                  </span>
                )}
                {s.elapsedS == null && s.liveElapsedS != null && (
                  <span
                    style={{
                      color: theme.primary,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                    }}
                  >
                    {s.liveElapsedS.toFixed(1)}s
                  </span>
                )}
                <span
                  style={{
                    color: statusColor,
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: 1,
                  }}
                >
                  {failed ? 'FAIL' : done ? 'DONE' : running ? 'RUN' : 'WAIT'}
                </span>
              </div>
            );
          })}
        </div>
        {stream.elapsedS != null && (
          <div
            style={{
              fontSize: 11,
              color: theme.fg3,
              fontFamily: 'var(--font-mono)',
              textAlign: 'right',
            }}
          >
            total {stream.elapsedS.toFixed(1)}s
            {stream.narrativeTokens.in != null && stream.narrativeTokens.out != null && (
              <> · narrative {stream.narrativeTokens.in}→{stream.narrativeTokens.out} tok</>
            )}
          </div>
        )}
      </div>

      {/* RIGHT · Narrative stream */}
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
            brahma · {stream.model || 'narrative'}
          </div>
          <div style={{ flex: 1 }} />
          <PulseDot
            color={stream.status === 'complete' ? '#4ADE80' : stream.status === 'error' ? '#F87171' : '#60A5FA'}
            size={7}
          />
          <span
            style={{
              fontSize: 11,
              color: stream.status === 'complete' ? '#4ADE80' : stream.status === 'error' ? '#F87171' : '#60A5FA',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {stream.status}
          </span>
        </div>
        <div
          style={{
            padding: '14px 18px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            color: '#E5E7EB',
            lineHeight: 1.75,
            flex: 1,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {stream.narrative ? (
            <>
              {stream.narrative}
              {stream.status === 'streaming' && (
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
              )}
            </>
          ) : (
            <span style={{ color: '#6B7280' }}>
              {stream.status === 'connecting' ? 'connecting to engine…' : 'waiting for narrative…'}
            </span>
          )}
        </div>
        <StageLogTail stream={stream} stages={stages} />
      </div>
    </div>
  );
}

/**
 * Bottom panel of the right pane — live tail of stdout from the active
 * stage subprocess. G3: when a stage has failed, this panel pins to
 * that stage with a red frame, larger height, and ~15 lines of context
 * so the user can read the traceback without hunting.
 */
function StageLogTail({ stream, stages }) {
  const failed = stream.failedStage;
  const activeIndex = (() => {
    if (failed && Number.isInteger(failed.index)) return failed.index;
    const running = stages.findIndex((s) => s.status === 'running');
    if (running >= 0) return running;
    const indices = Object.keys(stream.stageLogs || {}).map(Number).sort((a, b) => b - a);
    return indices[0] ?? -1;
  })();
  if (activeIndex < 0) return null;

  const lines = (stream.stageLogs && stream.stageLogs[activeIndex]) || [];
  if (!lines.length) return null;
  const isFailed = !!failed && failed.index === activeIndex;
  const tail = lines.slice(isFailed ? -15 : -7);
  const stage = stages[activeIndex];

  const accent = isFailed ? '#F87171' : '#60A5FA';
  const headerBg = isFailed ? '#3F1313' : '#0E1626';
  const headerBorder = isFailed ? '#7F1D1D' : '#1F2937';

  return (
    <div
      style={{
        borderTop: `1px solid ${isFailed ? '#7F1D1D' : '#1F2937'}`,
        background: isFailed ? '#1A0808' : '#070D1A',
        maxHeight: isFailed ? 240 : 140,
        overflow: 'auto',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '6px 16px',
          fontSize: 10,
          letterSpacing: 1.4,
          color: isFailed ? '#FCA5A5' : '#9CA3AF',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          textTransform: 'uppercase',
          background: headerBg,
          borderBottom: `1px solid ${headerBorder}`,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          position: 'sticky',
          top: 0,
        }}
      >
        <span style={{ color: accent }}>{isFailed ? '✕' : '›'}</span>
        <span>
          stage {String(activeIndex + 1).padStart(2, '0')}
          {' '}
          {isFailed ? 'FAILED' : 'log'}
          {' · '}
          {stage?.name || failed?.label || ''}
        </span>
        {isFailed && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              color: '#FCA5A5',
              opacity: 0.85,
              textTransform: 'none',
              letterSpacing: 0,
              fontWeight: 500,
            }}
          >
            full log: {failed?.logPath?.split(/[\\/]/).pop()}
          </span>
        )}
      </div>
      <div
        style={{
          padding: '8px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: isFailed ? 12 : 11.5,
          color: isFailed ? '#FCA5A5' : '#CBD5E1',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}
      >
        {tail.map((l, i) => (
          <div
            key={i}
            style={{
              opacity: isFailed ? 1 : (i === tail.length - 1 ? 1 : 0.5 + (i / tail.length) * 0.5),
              overflow: isFailed ? 'visible' : 'hidden',
              textOverflow: isFailed ? 'clip' : 'ellipsis',
              whiteSpace: isFailed ? 'pre-wrap' : 'nowrap',
              wordBreak: isFailed ? 'break-word' : 'normal',
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockRunning({ scenario, theme, stageIdx, onComplete }) {
  const stages = getStagesForScenario(scenario);
  const [logLines, setLogLines] = useState([]);
  const prevStage = useRef(stageIdx);
  const idRef = useRef(0);

  useEffect(() => {
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
