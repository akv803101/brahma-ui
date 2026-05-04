import React, { useCallback, useEffect, useState } from 'react';
import { feedbackApi, useAuth, ApiError } from '../../auth';

/**
 * Inline feedback row that appears below the Live Predict result panel.
 *
 *   "Was this correct?  [✓ Yes]  [✗ No]  [Skip]"
 *
 * On ✗ the form expands with a polymorphic actual-value input keyed by
 * scenario.problemType. Submitting POSTs /api/feedback. After success,
 * a small mono caption shows "feedback logged · v{version} · accuracy NN%"
 * and a callback bubbles up to the parent so the page can refresh stats.
 */
export default function FeedbackWidget({ scenario, theme, runId, currentInputs, predictedScore, predictedLabel, predictedTier, onSubmitted }) {
  const { currentProject, refresh: refreshAuth } = useAuth();
  const [phase, setPhase] = useState('idle');         // idle | correcting | submitting | done
  const [actualValue, setActualValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [lastSubmit, setLastSubmit] = useState(null); // { wasCorrect, ts, modelVersion }
  const [stats, setStats] = useState(null);
  const [recalibrating, setRecalibrating] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!currentProject) return;
    try {
      const s = await feedbackApi.stats({
        projectId: currentProject.id,
        scenarioId: scenario.id,
      });
      setStats(s);
    } catch {
      /* ignore */
    }
  }, [currentProject?.id, scenario.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const submit = async (wasCorrect, actual = null) => {
    if (!currentProject) {
      setError('Pick a project first.');
      return;
    }
    setPhase('submitting');
    setError(null);
    try {
      const row = await feedbackApi.submit({
        projectId: currentProject.id,
        scenarioId: scenario.id,
        runId: runId || null,
        inputs: currentInputs,
        predictedScore: predictedScore,
        predictedLabel: predictedLabel,
        predictedTier: predictedTier,
        wasCorrect,
        actualValue: actual,
        note: note || null,
      });
      setPhase('done');
      setLastSubmit({ wasCorrect, ts: Date.now(), modelVersion: row.model_version });
      setActualValue('');
      setNote('');
      onSubmitted?.(row);
      fetchStats();
      // Reset to idle after 3 seconds so the user can submit another
      setTimeout(() => setPhase('idle'), 3000);
    } catch (e) {
      setPhase('correcting');
      setError(e instanceof ApiError ? e.message : 'Could not log feedback.');
    }
  };

  const promptDisabled = !currentProject || phase === 'submitting';

  const recalibrate = async () => {
    if (!currentProject) return;
    setRecalibrating(true);
    try {
      await feedbackApi.recalibrate(currentProject.id);
      await fetchStats();
      // also refresh auth (so the ambient model_version reflected anywhere stays in sync)
      refreshAuth?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Recalibration failed.');
    } finally {
      setRecalibrating(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 16px',
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <ModelStatusBar
        theme={theme}
        stats={stats}
        recalibrating={recalibrating}
        onRecalibrate={recalibrate}
      />

      {runId && (
        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: theme.fg2,
            background: theme.bg === '#0B1020' ? '#1F2937' : '#F3F4F6',
            padding: '3px 8px',
            borderRadius: 999,
            border: `1px solid ${theme.border}`,
            letterSpacing: 0.4,
          }}
          title="Feedback rows from this widget are linked to this real run"
        >
          <span style={{ color: theme.primary, fontWeight: 700 }}>●</span>
          <span>tied to run {runId.slice(0, 8)}</span>
        </div>
      )}

      {phase === 'idle' && (
        <PromptRow
          theme={theme}
          disabled={promptDisabled}
          onYes={() => submit(true, null)}
          onNo={() => setPhase('correcting')}
          onSkip={() => onSubmitted?.()}
          lastSubmit={lastSubmit}
        />
      )}

      {phase === 'correcting' && (
        <CorrectingForm
          theme={theme}
          scenario={scenario}
          actualValue={actualValue}
          setActualValue={setActualValue}
          note={note}
          setNote={setNote}
          error={error}
          onCancel={() => {
            setPhase('idle');
            setActualValue('');
            setNote('');
            setError(null);
          }}
          onSubmit={() => {
            if (!actualValue.trim()) {
              setError('Tell Brahma what the actual outcome was.');
              return;
            }
            submit(false, actualValue.trim());
          }}
          submitting={phase === 'submitting'}
        />
      )}

      {phase === 'submitting' && (
        <div style={{ fontSize: 12, color: theme.fg2, fontFamily: 'var(--font-mono)' }}>
          Logging feedback…
        </div>
      )}

      {phase === 'done' && lastSubmit && (
        <DoneRow theme={theme} lastSubmit={lastSubmit} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Model status bar — version + accuracy + retrain banner
// ─────────────────────────────────────────────────────────────────────

function ModelStatusBar({ theme, stats, recalibrating, onRecalibrate }) {
  if (!stats) return null;
  const accuracyPct = stats.total ? (stats.accuracy * 100).toFixed(1) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: theme.fg2,
          letterSpacing: 0.6,
        }}
      >
        <span style={{ color: theme.primary, fontWeight: 800, letterSpacing: 1.2 }}>
          MODEL {stats.model_version}
        </span>
        <span>·</span>
        <span>
          {stats.total === 0
            ? 'no human feedback yet'
            : `accuracy ${accuracyPct}% on ${stats.total} feedbacks`}
        </span>
        {stats.last_calibrated_at && (
          <>
            <span>·</span>
            <span>last recalibrated {formatRelative(stats.last_calibrated_at)}</span>
          </>
        )}
      </div>

      {stats.retrain_recommended && (
        <RetrainBanner
          theme={theme}
          stats={stats}
          recalibrating={recalibrating}
          onRecalibrate={onRecalibrate}
        />
      )}
    </div>
  );
}

function RetrainBanner({ theme, stats, recalibrating, onRecalibrate }) {
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: isDark ? '#1E3A8A33' : '#EFF6FF',
        border: `1px solid ${theme.primary}55`,
        borderRadius: 10,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: theme.primary,
          boxShadow: `0 0 0 4px ${theme.primary}33`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: theme.primary,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1,
          }}
        >
          {stats.corrections_since_calibration} CORRECTIONS · BRAHMA CAN RECALIBRATE
        </div>
        <div style={{ fontSize: 11, color: theme.fg2, marginTop: 2 }}>
          Apply your feedback. Bumps {stats.model_version} → next version.
        </div>
      </div>
      <button
        type="button"
        onClick={onRecalibrate}
        disabled={recalibrating}
        style={{
          padding: '7px 16px',
          borderRadius: 8,
          border: 'none',
          background: theme.primary,
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          cursor: recalibrating ? 'not-allowed' : 'pointer',
          opacity: recalibrating ? 0.7 : 1,
          fontFamily: 'var(--font-sans)',
          letterSpacing: 0.3,
        }}
      >
        {recalibrating ? 'Recalibrating…' : 'Re-train now →'}
      </button>
    </div>
  );
}

function formatRelative(iso) {
  const t = new Date(iso).getTime();
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return 'just now';
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────
// Idle prompt row
// ─────────────────────────────────────────────────────────────────────

function PromptRow({ theme, disabled, onYes, onNo, onSkip, lastSubmit }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        Was Brahma right?
      </div>
      <FeedbackButton
        theme={theme}
        kind="yes"
        disabled={disabled}
        onClick={onYes}
      >
        ✓ Correct
      </FeedbackButton>
      <FeedbackButton
        theme={theme}
        kind="no"
        disabled={disabled}
        onClick={onNo}
      >
        ✗ Wrong — fix it
      </FeedbackButton>
      <FeedbackButton theme={theme} kind="skip" disabled={disabled} onClick={onSkip}>
        Skip
      </FeedbackButton>
      <div style={{ flex: 1 }} />
      {lastSubmit && (
        <span
          style={{
            fontSize: 11,
            color: theme.fg3,
            fontFamily: 'var(--font-mono)',
          }}
        >
          last logged: {lastSubmit.wasCorrect ? '✓ correct' : '✗ corrected'}
        </span>
      )}
    </div>
  );
}

function FeedbackButton({ theme, kind, disabled, onClick, children }) {
  const isDark = theme.bg === '#0B1020';
  let bg = 'transparent', fg = theme.fg2, border = theme.border;
  if (kind === 'yes') {
    bg = isDark ? '#14532D33' : '#F0FDF4';
    fg = theme.pos;
    border = `${theme.pos}55`;
  } else if (kind === 'no') {
    bg = isDark ? '#7F1D1D33' : '#FEE2E2';
    fg = theme.neg;
    border = `${theme.neg}55`;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'var(--font-sans)',
        letterSpacing: 0.3,
        transition: 'opacity .15s, transform .05s',
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Correcting form — polymorphic actual-value input by problemType
// ─────────────────────────────────────────────────────────────────────

function CorrectingForm({
  theme,
  scenario,
  actualValue,
  setActualValue,
  note,
  setNote,
  error,
  onCancel,
  onSubmit,
  submitting,
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1.5,
          fontWeight: 700,
          color: theme.neg,
          textTransform: 'uppercase',
        }}
      >
        Tell Brahma what the actual outcome was
      </div>
      <ActualValueInput
        theme={theme}
        scenario={scenario}
        value={actualValue}
        onChange={setActualValue}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional — note for context (e.g. 'tested with last quarter's data')"
        style={{
          padding: '9px 12px',
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
          color: theme.fg,
          fontSize: 12,
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          boxSizing: 'border-box',
          width: '100%',
        }}
      />
      {error && (
        <div
          style={{
            fontSize: 11,
            color: theme.neg,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 0.4,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.fg2,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: `1px solid ${theme.primary}`,
            background: theme.primary,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            fontFamily: 'var(--font-sans)',
            letterSpacing: 0.3,
          }}
        >
          {submitting ? 'Submitting…' : 'Submit correction'}
        </button>
      </div>
    </form>
  );
}

function ActualValueInput({ theme, scenario, value, onChange }) {
  const pt = scenario.problemType;

  if (pt === 'classification' || pt === 'imbalanced' || pt === 'semisupervised') {
    return <BinaryToggle theme={theme} value={value} onChange={onChange} pt={pt} />;
  }
  if (pt === 'anomaly') {
    return (
      <TierToggle
        theme={theme}
        value={value}
        onChange={onChange}
        options={[
          { id: 'NORMAL',  label: 'Normal' },
          { id: 'SUSPECT', label: 'Suspect' },
          { id: 'ANOMALY', label: 'Anomaly' },
        ]}
      />
    );
  }
  if (pt === 'clustering') {
    return (
      <TierToggle
        theme={theme}
        value={value}
        onChange={onChange}
        options={(scenario.clusters || []).map((c) => ({
          id: String(c.id),
          label: `C${c.id} · ${c.name}`,
        }))}
      />
    );
  }
  if (pt === 'regression') {
    return (
      <NumericInput
        theme={theme}
        label="Actual value"
        prefix="$"
        value={value}
        onChange={onChange}
        placeholder="2150"
      />
    );
  }
  if (pt === 'forecast') {
    return (
      <NumericInput
        theme={theme}
        label="Actual units sold"
        suffix="units"
        value={value}
        onChange={onChange}
        placeholder="142"
      />
    );
  }
  return <TextInput theme={theme} value={value} onChange={onChange} />;
}

function BinaryToggle({ theme, value, onChange, pt }) {
  const labels = {
    classification: ['Did churn', "Didn't churn"],
    imbalanced:     ['Was fraud', 'Not fraud'],
    semisupervised: ['Defaulted', "Didn't default"],
  };
  const [yes, no] = labels[pt] || ['Yes', 'No'];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[
        { id: 'YES', label: yes },
        { id: 'NO',  label: no },
      ].map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${active ? theme.primary : theme.border}`,
              background: active
                ? theme.primary
                : theme.bg === '#0B1020'
                ? '#0B1020'
                : '#F9FAFB',
              color: active ? '#fff' : theme.fg,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TierToggle({ theme, value, onChange, options }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${active ? theme.primary : theme.border}`,
              background: active
                ? theme.primary
                : theme.bg === '#0B1020'
                ? '#0B1020'
                : '#F9FAFB',
              color: active ? '#fff' : theme.fg,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              textAlign: 'left',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumericInput({ theme, label, prefix, suffix, value, onChange, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {prefix && (
        <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: theme.fg2 }}>{prefix}</span>
      )}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        style={{
          flex: 1,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
          color: theme.fg,
          fontSize: 14,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {suffix && (
        <span style={{ fontSize: 13, color: theme.fg2 }}>{suffix}</span>
      )}
    </div>
  );
}

function TextInput({ theme, value, onChange }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Actual outcome"
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
        color: theme.fg,
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Done state
// ─────────────────────────────────────────────────────────────────────

function DoneRow({ theme, lastSubmit }) {
  const isDark = theme.bg === '#0B1020';
  const accent = lastSubmit.wasCorrect ? theme.pos : theme.primary;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 8px',
        borderRadius: 8,
        background: isDark
          ? lastSubmit.wasCorrect
            ? '#14532D33'
            : '#1E3A8A33'
          : lastSubmit.wasCorrect
          ? '#F0FDF4'
          : '#EFF6FF',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: accent,
        letterSpacing: 0.6,
        fontWeight: 700,
      }}
    >
      <span>✓</span>
      <span>
        {lastSubmit.wasCorrect ? 'CORRECT — LOGGED' : 'CORRECTION LOGGED'} · BRAHMA REMEMBERS · {lastSubmit.modelVersion || 'v1.0.0'}
      </span>
    </div>
  );
}
