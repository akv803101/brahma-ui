import React, { useState, useEffect } from 'react';
import { useCountUp } from '../../theme/useTheme.js';
import FeedbackWidget from './FeedbackWidget.jsx';

/**
 * Live Predict screen — left column: sliders, right column: result panel.
 * The result panel branches on `scenario.problemType`:
 *
 *   classification  / imbalanced / semisupervised → percentage + HIGH/MED/LOW tier
 *   regression                                    → dollar amount
 *   forecast                                      → units
 *   clustering                                    → cluster id + persona name + description
 *   anomaly                                       → 0..5 anomaly score + NORMAL/SUSPECT/ANOMALY
 *
 * Semi-supervised additionally renders a "labeled vs pseudo region" chip
 * derived from the input heuristic.
 */

export default function LivePredict({ scenario, theme }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(scenario.liveInputs.map((f) => [f.key, f.def]))
  );
  useEffect(() => {
    setState(Object.fromEntries(scenario.liveInputs.map((f) => [f.key, f.def])));
  }, [scenario.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const raw = scenario.scoreFn(state);
  const score = Math.max(0, Math.min(0.999999, raw));
  const animScore = useCountUp(score, 500, [Object.values(state).join('|')]);

  const result = computeResult(scenario, state, score, animScore, theme);
  const isDark = theme.bg === '#0B1020';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT · sliders */}
      <div
        style={{
          background: theme.card,
          borderRadius: 12,
          padding: '20px 24px',
          border: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            color: theme.fg2,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          Live Prediction · feed Brahma a record
        </div>
        {scenario.liveInputs.map((f) => (
          <Slider
            key={f.key}
            label={f.label}
            val={state[f.key]}
            setVal={(v) => setState((s) => ({ ...s, [f.key]: v }))}
            min={f.min}
            max={f.max}
            step={f.step || 1}
            fmt={f.fmt}
            unit={f.unit}
            theme={theme}
          />
        ))}
      </div>

      {/* RIGHT · result panel */}
      <div
        style={{
          background: result.tierColors.bg,
          borderRadius: 12,
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          border: `1px solid ${result.tierColors.accent}33`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.5,
            fontFamily: 'var(--font-mono)',
            color: result.tierColors.fg,
          }}
        >
          <span>
            {result.label} · {result.tier}
          </span>
          {result.confidenceChip && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                letterSpacing: 1,
                background: result.confidenceChip.bg,
                color: result.confidenceChip.fg,
                border: `1px solid ${result.confidenceChip.fg}33`,
              }}
            >
              {result.confidenceChip.text}
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: result.bigSize || 56,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: -2,
            lineHeight: 1,
            color: result.tierColors.fg,
            marginTop: 6,
          }}
        >
          {result.display}
        </div>

        {result.subDisplay && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: result.tierColors.fg,
              opacity: 0.85,
              marginTop: 6,
            }}
          >
            {result.subDisplay}
          </div>
        )}

        {/* Score-track bar (omitted for clustering since the metric is categorical) */}
        {scenario.problemType !== 'clustering' && (
          <div
            style={{
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              background: isDark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.6)',
              marginTop: 14,
            }}
          >
            <div
              style={{
                width: `${animScore * 100}%`,
                height: '100%',
                borderRadius: 999,
                background: result.tierColors.accent,
                transition: 'width .3s',
              }}
            />
          </div>
        )}

        <div
          style={{
            fontSize: 13,
            color: result.tierColors.fg,
            fontWeight: 500,
            marginTop: 14,
            lineHeight: 1.5,
          }}
        >
          {result.recommendation}
        </div>
      </div>
    </div>

    <FeedbackWidget
      scenario={scenario}
      theme={theme}
      currentInputs={state}
      predictedScore={score}
      predictedLabel={result.label}
      predictedTier={result.tier}
    />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Result computation, branched per problemType
// ────────────────────────────────────────────────────────────────────────

function computeResult(scenario, state, score, animScore, theme) {
  switch (scenario.problemType) {
    case 'regression':       return regressionResult(scenario, score, animScore, theme);
    case 'forecast':         return forecastResult(scenario, score, animScore, theme);
    case 'clustering':       return clusteringResult(scenario, score, theme);
    case 'anomaly':          return anomalyResult(scenario, score, animScore, theme);
    case 'semisupervised':   return semiSupResult(scenario, state, score, animScore, theme);
    case 'imbalanced':       return imbalancedResult(scenario, score, animScore, theme);
    case 'classification':
    default:                 return classificationResult(scenario, score, animScore, theme);
  }
}

function tierFromScore(score, theme) {
  const tier = score > 0.6 ? 'HIGH' : score > 0.35 ? 'MEDIUM' : 'LOW';
  return { tier, tierColors: tierColorsFor(tier, theme) };
}

function tierColorsFor(tier, theme) {
  const isDark = theme.bg === '#0B1020';
  switch (tier) {
    case 'HIGH':
    case 'ANOMALY':
      return isDark
        ? { bg: '#7F1D1D33', fg: '#FCA5A5', accent: theme.neg }
        : { bg: '#FEE2E2',   fg: '#991B1B', accent: '#DC2626' };
    case 'MEDIUM':
    case 'SUSPECT':
      return isDark
        ? { bg: '#78350F33', fg: '#FDBA74', accent: theme.warn }
        : { bg: '#FEF3C7',   fg: '#92400E', accent: '#D97706' };
    case 'LOW':
    case 'NORMAL':
    default:
      return isDark
        ? { bg: '#14532D33', fg: '#86EFAC', accent: theme.pos }
        : { bg: '#DCFCE7',   fg: '#14532D', accent: '#16A34A' };
  }
}

// ── classification ──────────────────────────────────────────────────────
function classificationResult(scenario, score, animScore, theme) {
  const { tier, tierColors } = tierFromScore(score, theme);
  return {
    label: 'CHURN RISK',
    tier,
    tierColors,
    display: `${(animScore * 100).toFixed(1)}%`,
    recommendation: {
      HIGH: '→ Route to retention team within 48 h. Offer fee waiver.',
      MEDIUM: '→ Watch-list. Monthly re-score.',
      LOW: '→ No action. Keep in standard segment.',
    }[tier],
  };
}

// ── imbalanced (fraud) ──────────────────────────────────────────────────
function imbalancedResult(scenario, score, animScore, theme) {
  const { tier, tierColors } = tierFromScore(score, theme);
  return {
    label: 'FRAUD RISK',
    tier,
    tierColors,
    display: `${(animScore * 100).toFixed(1)}%`,
    recommendation: {
      HIGH: '→ Decline & route for manual review within 60 s.',
      MEDIUM: '→ Step-up authentication. Flag for review.',
      LOW: '→ Approve. No action.',
    }[tier],
  };
}

// ── regression (LTV) ────────────────────────────────────────────────────
function regressionResult(scenario, score, animScore, theme) {
  const { tier, tierColors } = tierFromScore(score, theme);
  const max = scenario.displayMax || 5000;
  return {
    label: 'PREDICTED VALUE',
    tier,
    tierColors,
    display: `$${Math.round(animScore * max).toLocaleString()}`,
    recommendation: {
      HIGH: '→ High-value segment. Prioritise for concierge onboarding.',
      MEDIUM: '→ Standard journey with cross-sell triggers.',
      LOW: '→ Standard segment. Automated journey.',
    }[tier],
  };
}

// ── forecast (units) ────────────────────────────────────────────────────
function forecastResult(scenario, score, animScore, theme) {
  const { tier, tierColors } = tierFromScore(score, theme);
  const max = scenario.displayMax || 200;
  return {
    label: 'FORECAST',
    tier,
    tierColors,
    display: `${Math.round(animScore * max)} units`,
    recommendation: {
      HIGH: '→ Pre-position inventory · expect stockout risk.',
      MEDIUM: '→ Standard replenishment cadence.',
      LOW: '→ Drawdown buffer stock.',
    }[tier],
  };
}

// ── clustering — categorical assignment ─────────────────────────────────
function clusteringResult(scenario, score, theme) {
  const idx = Math.floor(score * scenario.clusters.length);
  const cluster = scenario.clusters[Math.min(idx, scenario.clusters.length - 1)];
  const isDark = theme.bg === '#0B1020';

  // Tier colors track the cluster's own color so the result banner reads as
  // "you belong to *this* segment". We keep a generic light-tinted background.
  const tierColors = {
    bg: isDark ? `${cluster.color}22` : `${cluster.color}15`,
    fg: cluster.color,
    accent: cluster.color,
  };

  const recsByCluster = {
    'Dormant Skeptics':     '→ Win-back campaign. Test fee waiver + re-engagement creative.',
    'Bargain Hunters':      '→ Promo-driven journey. Volume discounts and bundle offers.',
    'Mainstream Loyalists': '→ Standard journey. Cross-sell on natural cadence.',
    'Premium Spenders':     '→ Premium concierge. New-product previews and accelerator rewards.',
    'VIP Champions':        '→ VIP retention. Dedicated account manager + invite-only events.',
  };

  return {
    label: 'SEGMENT',
    tier: cluster.name.toUpperCase(),
    tierColors,
    display: `C${cluster.id}`,
    bigSize: 60,
    subDisplay: `${cluster.name} · ${(cluster.share * 100).toFixed(0)}% of base`,
    recommendation: recsByCluster[cluster.name] || `→ Apply ${cluster.name} playbook.`,
  };
}

// ── anomaly — score + tier ──────────────────────────────────────────────
function anomalyResult(scenario, score, animScore, theme) {
  const { suspect, anomaly } = scenario.anomalyTiers || { suspect: 0.4, anomaly: 0.7 };
  const tier = score >= anomaly ? 'ANOMALY' : score >= suspect ? 'SUSPECT' : 'NORMAL';
  const tierColors = tierColorsFor(tier, theme);
  const max = scenario.anomalyDisplayMax || 5;
  return {
    label: 'ANOMALY',
    tier,
    tierColors,
    display: (animScore * max).toFixed(2),
    subDisplay: `0 → ${max} score scale · p99 cutoff = ${(anomaly * max).toFixed(2)}`,
    recommendation: {
      ANOMALY: '→ Block. Forward to fraud ops with score + driver attribution.',
      SUSPECT: '→ Step-up auth. Flag for analyst review within 4 h.',
      NORMAL:  '→ Pass through. No action.',
    }[tier],
  };
}

// ── semi-supervised — probability + labeled/pseudo confidence chip ──────
function semiSupResult(scenario, state, score, animScore, theme) {
  const { tier, tierColors } = tierFromScore(score, theme);
  const isDark = theme.bg === '#0B1020';

  // Heuristic: high credit score AND low DTI → labeled-rich region.
  // (Real model would expose a confidence/uncertainty estimate.)
  const labeledRegion =
    (state.creditScore ?? 680) > 700 || (state.dti ?? 0.3) < 0.25;
  const confidenceChip = labeledRegion
    ? { text: 'LABELED REGION', bg: isDark ? '#1E3A8A33' : '#DBEAFE', fg: theme.primary }
    : { text: 'PSEUDO REGION', bg: isDark ? '#7C3AED33' : '#EDE9FE', fg: '#7C3AED' };

  return {
    label: 'DEFAULT RISK',
    tier,
    tierColors,
    display: `${(animScore * 100).toFixed(1)}%`,
    confidenceChip,
    recommendation: {
      HIGH: '→ Manual underwriting review. Decline default offer.',
      MEDIUM: '→ Standard rate + monthly re-score.',
      LOW: '→ Approve at default rate.',
    }[tier],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Slider primitive — local to LivePredict
// ────────────────────────────────────────────────────────────────────────
function Slider({ label, val, setVal, min, max, step = 1, fmt, unit = '', theme }) {
  return (
    <label style={{ display: 'block', margin: '10px 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: theme.fg2, fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: theme.fg,
          }}
        >
          {fmt ? fmt(val) : val}
          {unit && ` ${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => setVal(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: theme.primary, color: theme.fg2 }}
      />
    </label>
  );
}
