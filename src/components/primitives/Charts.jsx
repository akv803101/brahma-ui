/**
 * Brahma chart primitives — pure SVG, no chart library.
 *
 * All charts use a 200×140 viewBox for consistent sizing inside ChartCard.
 * Color tokens come from the active theme. Animation is via SVG <animate>
 * (one-shot stroke-dash reveal on first mount; nothing custom on data change).
 *
 * Grouped by problemType — Phase 5 (ProblemCharts) routes one of these grids
 * per problemType.
 *
 *   classification    → ROCChart, PRChart, ConfusionMatrix
 *   regression        → ResidualsChart, ActualVsPredicted
 *   forecast          → ForecastChart, MAPEByHorizonBars
 *   imbalanced        → PRCurveImbalanced, RecallAtFPRBars (+ ConfusionMatrix)
 *   clustering        → ClusterDistributionBar, SilhouetteBars, ElbowCurve
 *   anomaly           → AnomalyHistogram, ContaminationDonut (+ SHAPPanel)
 *   semisupervised    → SelfTrainingAUCCurve, ConfidenceDistribution, CoverageVsIterations
 */
import React, { useMemo } from 'react';

// ────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────

const VB = '0 0 200 140';
const svgFull = { width: '100%', height: '100%' };

function GridLines({ theme, rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <line
          key={i}
          x1="20"
          x2="190"
          y1={20 + i * (100 / (rows - 1))}
          y2={20 + i * (100 / (rows - 1))}
          stroke={theme.border}
          strokeWidth="1"
        />
      ))}
    </>
  );
}

function Axes({ theme }) {
  return (
    <>
      <line x1="20" y1="120" x2="190" y2="120" stroke={theme.fg2} strokeWidth="1" />
      <line x1="20" y1="20"  x2="20"  y2="120" stroke={theme.fg2} strokeWidth="1" />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════

export function ROCChart({ theme }) {
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} />
      <Axes theme={theme} />
      {/* y = x baseline */}
      <line x1="20" y1="120" x2="190" y2="20" stroke={theme.fg3} strokeDasharray="3 3" />
      {/* ROC curve */}
      <path
        d="M20,120 Q30,30 60,25 T130,21 T190,20"
        fill="none"
        stroke={theme.primary}
        strokeWidth="2.5"
      >
        <animate attributeName="stroke-dasharray" from="0 600" to="600 0" dur="1.2s" fill="freeze" />
      </path>
      <path
        d="M20,120 Q30,30 60,25 T130,21 T190,20 L190,120 Z"
        fill={theme.primary}
        fillOpacity="0.1"
      />
    </svg>
  );
}

export function PRChart({ theme }) {
  return (
    <svg viewBox={VB} style={svgFull}>
      <Axes theme={theme} />
      <path
        d="M20,22 L80,25 L140,32 L175,60 L190,110"
        fill="none"
        stroke={theme.pos}
        strokeWidth="2.5"
      >
        <animate attributeName="stroke-dasharray" from="0 600" to="600 0" dur="1.2s" fill="freeze" />
      </path>
    </svg>
  );
}

export function ConfusionMatrix({ theme, c }) {
  const isDark = theme.bg === '#0B1020';
  const cells = [
    { v: c.tn, l: 'TN', bg: isDark ? '#1E3A8A' : '#DBEAFE', fg: isDark ? '#93C5FD' : '#1E3A8A' },
    { v: c.fp, l: 'FP', bg: isDark ? '#7F1D1D' : '#FEE2E2', fg: isDark ? '#FCA5A5' : '#991B1B' },
    { v: c.fn, l: 'FN', bg: isDark ? '#7F1D1D' : '#FEE2E2', fg: isDark ? '#FCA5A5' : '#991B1B' },
    { v: c.tp, l: 'TP', bg: isDark ? '#14532D' : '#BBF7D0', fg: isDark ? '#86EFAC' : '#14532D' },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 6,
        height: '100%',
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          style={{
            borderRadius: 8,
            background: cell.bg,
            color: cell.fg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              letterSpacing: -0.5,
            }}
          >
            {cell.v.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, opacity: 0.8 }}>
            {cell.l}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// REGRESSION
// ════════════════════════════════════════════════════════════════════════

export function ResidualsChart({ theme }) {
  const pts = useMemo(
    () =>
      Array.from({ length: 80 }, () => ({
        x: 20 + Math.random() * 170,
        y: 70 + (Math.random() - 0.5) * 60 + Math.sin(Math.random() * 6) * 5,
      })),
    []
  );
  return (
    <svg viewBox={VB} style={svgFull}>
      <line x1="20" y1="70" x2="190" y2="70" stroke={theme.fg3} strokeDasharray="3 3" />
      <Axes theme={theme} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={theme.primary} fillOpacity="0.6">
          <animate attributeName="r" from="0" to="2" dur="0.6s" begin={`${i * 0.008}s`} fill="freeze" />
        </circle>
      ))}
    </svg>
  );
}

export function ActualVsPredicted({ theme }) {
  const pts = useMemo(() => {
    return Array.from({ length: 80 }, () => {
      const t = Math.random();
      const noise = (Math.random() - 0.5) * 0.18;
      // x = actual (mapped to 20..190), y = predicted (mapped to 120..20 inverted)
      const x = 20 + t * 170;
      const yIdeal = 120 - t * 100;
      const y = yIdeal + noise * 80;
      return { x, y };
    });
  }, []);
  return (
    <svg viewBox={VB} style={svgFull}>
      <Axes theme={theme} />
      {/* y = x diagonal */}
      <line x1="20" y1="120" x2="190" y2="20" stroke={theme.fg3} strokeDasharray="4 3" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={theme.accent2} fillOpacity="0.7">
          <animate attributeName="r" from="0" to="2" dur="0.6s" begin={`${i * 0.008}s`} fill="freeze" />
        </circle>
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FORECAST
// ════════════════════════════════════════════════════════════════════════

export function ForecastChart({ theme }) {
  return (
    <svg viewBox={VB} style={svgFull}>
      <Axes theme={theme} />
      {/* now line */}
      <line x1="120" y1="20" x2="120" y2="120" stroke={theme.fg3} strokeDasharray="3 3" />
      <text x="122" y="30" fontSize="8" fill={theme.fg2} fontFamily="var(--font-mono)">
        forecast →
      </text>
      {/* historical */}
      <path
        d="M20,90 C30,70 40,80 50,75 S70,60 80,68 S100,72 110,60 L120,58"
        fill="none"
        stroke={theme.fg}
        strokeWidth="2"
        opacity="0.85"
      />
      {/* forecast */}
      <path
        d="M120,58 C130,48 140,45 155,38 S180,32 190,28"
        fill="none"
        stroke={theme.primary}
        strokeWidth="2.5"
      >
        <animate attributeName="stroke-dasharray" from="0 400" to="400 0" dur="1.3s" fill="freeze" />
      </path>
      {/* PI band */}
      <path
        d="M120,52 C130,40 140,36 155,28 S180,22 190,18 L190,38 L155,48 L140,56 L130,60 L120,64 Z"
        fill={theme.primary}
        fillOpacity="0.15"
      />
    </svg>
  );
}

export function MAPEByHorizonBars({ theme }) {
  const horizons = [
    { label: '7d',  v: 4.2 },
    { label: '14d', v: 5.8 },
    { label: '30d', v: 7.1 },
    { label: '60d', v: 8.0 },
    { label: '90d', v: 8.4 },
  ];
  const max = Math.max(...horizons.map((h) => h.v));
  const slot = 170 / horizons.length;
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={4} />
      <Axes theme={theme} />
      {horizons.map((h, i) => {
        const barH = (h.v / max) * 95;
        const x = 25 + i * slot + slot * 0.18;
        const w = slot * 0.6;
        const y = 120 - barH;
        return (
          <g key={h.label}>
            <rect x={x} y={y} width={w} height={barH} fill={theme.primary} rx="2" opacity="0.9">
              <animate attributeName="height" from="0" to={barH} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
              <animate attributeName="y" from="120" to={y} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
            </rect>
            <text x={x + w / 2} y="132" fontSize="9" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              {h.label}
            </text>
            <text x={x + w / 2} y={y - 3} fontSize="8" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              {h.v.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// IMBALANCED
// ════════════════════════════════════════════════════════════════════════

export function PRCurveImbalanced({ theme }) {
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} />
      <Axes theme={theme} />
      <path
        d="M20,24 L60,28 L100,40 L140,62 L170,95 L190,118"
        fill="none"
        stroke={theme.pos}
        strokeWidth="2.5"
      >
        <animate attributeName="stroke-dasharray" from="0 600" to="600 0" dur="1.2s" fill="freeze" />
      </path>
      <path d="M20,118 L190,118" fill="none" stroke={theme.fg3} strokeDasharray="3 3" />
    </svg>
  );
}

export function RecallAtFPRBars({ theme }) {
  // Recall at increasing FPR operating points — the "operating curve summary"
  const points = [
    { fpr: '0.01%', recall: 0.512 },
    { fpr: '0.1%',  recall: 0.763 },
    { fpr: '1%',    recall: 0.892 },
    { fpr: '5%',    recall: 0.951 },
    { fpr: '10%',   recall: 0.974 },
  ];
  const slot = 170 / points.length;
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={4} />
      <Axes theme={theme} />
      {points.map((p, i) => {
        const barH = p.recall * 95;
        const x = 25 + i * slot + slot * 0.18;
        const w = slot * 0.6;
        const y = 120 - barH;
        const isOp = p.fpr === '0.1%';
        return (
          <g key={p.fpr}>
            <rect
              x={x}
              y={y}
              width={w}
              height={barH}
              fill={isOp ? theme.primary : theme.accent2}
              rx="2"
              opacity={isOp ? 1 : 0.7}
            >
              <animate attributeName="height" from="0" to={barH} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
              <animate attributeName="y" from="120" to={y} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
            </rect>
            <text x={x + w / 2} y="132" fontSize="9" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              {p.fpr}
            </text>
            <text x={x + w / 2} y={y - 3} fontSize="8" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              {(p.recall * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CLUSTERING
// ════════════════════════════════════════════════════════════════════════

export function ClusterDistributionBar({ clusters, theme }) {
  // Sorted horizontal bars (per design system: "no pie charts; use sorted horizontal bars")
  const sorted = useMemo(() => [...clusters].sort((a, b) => b.share - a.share), [clusters]);
  const max = Math.max(...sorted.map((c) => c.share));
  const rowH = 18;
  const top = 6;
  return (
    <svg viewBox={VB} style={svgFull}>
      {sorted.map((c, i) => {
        const y = top + i * (rowH + 4);
        const w = (c.share / max) * 130;
        return (
          <g key={c.id}>
            <text
              x="4"
              y={y + rowH * 0.7}
              fontSize="8.5"
              fill={theme.fg2}
              fontFamily="var(--font-mono)"
            >
              C{c.id}
            </text>
            <rect x="20" y={y} width={w} height={rowH} fill={c.color} rx="3">
              <animate attributeName="width" from="0" to={w} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
            </rect>
            <text
              x={w + 24}
              y={y + rowH * 0.7}
              fontSize="9"
              fill={theme.fg}
              fontFamily="var(--font-mono)"
            >
              {(c.share * 100).toFixed(0)}%
            </text>
            <text
              x={w + 50}
              y={y + rowH * 0.7}
              fontSize="8"
              fill={theme.fg2}
            >
              {c.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SilhouetteBars({ clusters, theme }) {
  // Per-cluster silhouette score — derived deterministically from cluster.share.
  // (Real data would come from sklearn.metrics.silhouette_samples grouped by label.)
  const data = useMemo(
    () =>
      clusters.map((c, i) => ({
        ...c,
        silhouette: 0.45 + (i * 0.07) + Math.min(0.25, c.share * 0.5),
      })),
    [clusters]
  );
  const slot = 170 / data.length;
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={4} />
      <Axes theme={theme} />
      {data.map((c, i) => {
        const barH = Math.min(1, c.silhouette) * 95;
        const x = 25 + i * slot + slot * 0.2;
        const w = slot * 0.6;
        const y = 120 - barH;
        return (
          <g key={c.id}>
            <rect x={x} y={y} width={w} height={barH} fill={c.color} rx="2">
              <animate attributeName="height" from="0" to={barH} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
              <animate attributeName="y" from="120" to={y} dur="0.7s" begin={`${i * 0.08}s`} fill="freeze" />
            </rect>
            <text x={x + w / 2} y="132" fontSize="9" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              C{c.id}
            </text>
            <text x={x + w / 2} y={y - 3} fontSize="8" fill={theme.fg2} textAnchor="middle" fontFamily="var(--font-mono)">
              {c.silhouette.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ElbowCurve({ theme }) {
  // k vs inertia — classic elbow shape. Marker at k=5 ("optimal").
  const data = [
    { k: 2, inertia: 0.95 },
    { k: 3, inertia: 0.72 },
    { k: 4, inertia: 0.52 },
    { k: 5, inertia: 0.34 },
    { k: 6, inertia: 0.27 },
    { k: 7, inertia: 0.23 },
    { k: 8, inertia: 0.20 },
  ];
  const xFor = (k) => 20 + ((k - 2) / 6) * 170;
  const yFor = (i) => 120 - i * 95;
  const path = data.map((d, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(d.k).toFixed(1)},${yFor(d.inertia).toFixed(1)}`).join(' ');
  const elbow = data.find((d) => d.k === 5);
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={4} />
      <Axes theme={theme} />
      <path d={path} fill="none" stroke={theme.primary} strokeWidth="2.5">
        <animate attributeName="stroke-dasharray" from="0 600" to="600 0" dur="1.2s" fill="freeze" />
      </path>
      {data.map((d) => (
        <circle key={d.k} cx={xFor(d.k)} cy={yFor(d.inertia)} r="2.5" fill={theme.primary} />
      ))}
      {/* Elbow marker */}
      <circle
        cx={xFor(elbow.k)}
        cy={yFor(elbow.inertia)}
        r="6"
        fill="none"
        stroke={theme.warn}
        strokeWidth="2"
      >
        <animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <text
        x={xFor(elbow.k) + 9}
        y={yFor(elbow.inertia) - 6}
        fontSize="9"
        fill={theme.warn}
        fontFamily="var(--font-mono)"
        fontWeight="700"
      >
        k=5
      </text>
      {data.map((d) => (
        <text
          key={'l' + d.k}
          x={xFor(d.k)}
          y="132"
          fontSize="9"
          fill={theme.fg2}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
        >
          {d.k}
        </text>
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ANOMALY
// ════════════════════════════════════════════════════════════════════════

export function AnomalyHistogram({ theme }) {
  // Bell-shaped distribution skewed right; bins above p99 colored red.
  const bins = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      // Right-skewed shape
      const h = Math.exp(-Math.pow((t - 0.35) * 4, 2)) + Math.exp(-Math.pow((t - 0.85) * 12, 2)) * 0.18;
      arr.push({ t, h });
    }
    return arr;
  }, []);
  const max = Math.max(...bins.map((b) => b.h));
  const w = 170 / bins.length;
  const threshT = 0.78; // p99 cutoff
  return (
    <svg viewBox={VB} style={svgFull}>
      <Axes theme={theme} />
      {bins.map((b, i) => {
        const isAnom = b.t >= threshT;
        const barH = (b.h / max) * 95;
        const x = 20 + i * w;
        const y = 120 - barH;
        return (
          <rect
            key={i}
            x={x + 0.5}
            y={y}
            width={w - 1}
            height={barH}
            fill={isAnom ? theme.neg : theme.primary}
            opacity={isAnom ? 0.95 : 0.85}
          >
            <animate attributeName="height" from="0" to={barH} dur="0.6s" begin={`${i * 0.015}s`} fill="freeze" />
            <animate attributeName="y" from="120" to={y} dur="0.6s" begin={`${i * 0.015}s`} fill="freeze" />
          </rect>
        );
      })}
      {/* Threshold line */}
      <line
        x1={20 + threshT * 170}
        y1="20"
        x2={20 + threshT * 170}
        y2="120"
        stroke={theme.neg}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <text
        x={20 + threshT * 170 + 3}
        y="28"
        fontSize="8"
        fill={theme.neg}
        fontFamily="var(--font-mono)"
      >
        p99
      </text>
    </svg>
  );
}

export function ContaminationDonut({ theme, contaminationPct = 2.3 }) {
  // Half-arc gauge — a bar/ring hybrid that respects the brand's "no pie charts"
  // rule (the design system reserves pies for data display; this is a single-metric gauge).
  const pct = contaminationPct / 100;
  const cx = 100;
  const cy = 100;
  const r = 60;
  const arcLen = Math.PI * r;            // semicircle circumference
  const offset = arcLen * (1 - pct);
  return (
    <svg viewBox={VB} style={svgFull}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={theme.border}
        strokeWidth="14"
        strokeLinecap="round"
      />
      {/* Filled portion */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={theme.neg}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${arcLen}`}
        strokeDashoffset={offset}
        transform={`rotate(180 ${cx} ${cy})`}
      >
        <animate
          attributeName="stroke-dashoffset"
          from={arcLen}
          to={offset}
          dur="1s"
          fill="freeze"
        />
      </path>
      {/* Centered value */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fontSize="22"
        fontWeight="800"
        fill={theme.fg}
        fontFamily="var(--font-mono)"
      >
        {contaminationPct.toFixed(1)}%
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fontSize="9"
        fill={theme.fg2}
        letterSpacing="1"
      >
        ANOMALOUS
      </text>
      <text
        x={cx - r - 3}
        y={cy + 14}
        textAnchor="end"
        fontSize="8"
        fill={theme.fg3}
        fontFamily="var(--font-mono)"
      >
        0%
      </text>
      <text
        x={cx + r + 3}
        y={cy + 14}
        fontSize="8"
        fill={theme.fg3}
        fontFamily="var(--font-mono)"
      >
        5%
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SEMI-SUPERVISED
// ════════════════════════════════════════════════════════════════════════

export function SelfTrainingAUCCurve({ curve, theme }) {
  // curve = scenario.selfTrainingCurve = [{ iter, auc, coverage }, ...]
  const xFor = (i) => 20 + (i / (curve.length - 1)) * 170;
  const yFor = (auc) => 120 - ((auc - 0.80) / 0.10) * 95;  // y range: 0.80..0.90+
  const path = curve.map((d, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(d.iter).toFixed(1)},${yFor(d.auc).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={4} />
      <Axes theme={theme} />
      <path d={path} fill="none" stroke={theme.primary} strokeWidth="2.5">
        <animate attributeName="stroke-dasharray" from="0 500" to="500 0" dur="1.2s" fill="freeze" />
      </path>
      {curve.map((d) => (
        <g key={d.iter}>
          <circle cx={xFor(d.iter)} cy={yFor(d.auc)} r="3" fill={theme.primary} />
          <text
            x={xFor(d.iter)}
            y="132"
            fontSize="9"
            fill={theme.fg2}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            iter {d.iter}
          </text>
        </g>
      ))}
      <text
        x={xFor(curve[curve.length - 1].iter)}
        y={yFor(curve[curve.length - 1].auc) - 6}
        fontSize="9"
        fill={theme.pos}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontWeight="700"
      >
        {curve[curve.length - 1].auc.toFixed(3)}
      </text>
    </svg>
  );
}

export function ConfidenceDistribution({ theme }) {
  // Bimodal histogram: labeled (low confidence) + pseudo (high confidence).
  // 30 bins; alternating fills to show labeled vs pseudo regions.
  const bins = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const labeled = Math.exp(-Math.pow((t - 0.35) * 5, 2)) * 0.65;
      const pseudo = Math.exp(-Math.pow((t - 0.85) * 7, 2));
      arr.push({ t, labeled, pseudo });
    }
    return arr;
  }, []);
  const max = Math.max(...bins.map((b) => b.labeled + b.pseudo));
  const w = 170 / bins.length;
  return (
    <svg viewBox={VB} style={svgFull}>
      <Axes theme={theme} />
      {bins.map((b, i) => {
        const lh = (b.labeled / max) * 95;
        const ph = (b.pseudo / max) * 95;
        const x = 20 + i * w;
        return (
          <g key={i}>
            <rect x={x + 0.4} y={120 - lh} width={w - 0.8} height={lh} fill={theme.accent2} opacity="0.9">
              <animate attributeName="height" from="0" to={lh} dur="0.6s" begin={`${i * 0.012}s`} fill="freeze" />
              <animate attributeName="y" from="120" to={120 - lh} dur="0.6s" begin={`${i * 0.012}s`} fill="freeze" />
            </rect>
            <rect x={x + 0.4} y={120 - lh - ph} width={w - 0.8} height={ph} fill={theme.primary} opacity="0.9">
              <animate attributeName="height" from="0" to={ph} dur="0.6s" begin={`${0.3 + i * 0.012}s`} fill="freeze" />
              <animate attributeName="y" from={120 - lh} to={120 - lh - ph} dur="0.6s" begin={`${0.3 + i * 0.012}s`} fill="freeze" />
            </rect>
          </g>
        );
      })}
      {/* Legend */}
      <g transform="translate(28 26)">
        <rect width="9" height="9" fill={theme.accent2} rx="2" />
        <text x="14" y="8" fontSize="9" fill={theme.fg2}>labeled</text>
        <rect x="60" width="9" height="9" fill={theme.primary} rx="2" />
        <text x="74" y="8" fontSize="9" fill={theme.fg2}>pseudo</text>
      </g>
    </svg>
  );
}

export function CoverageVsIterations({ curve, theme }) {
  // curve = scenario.selfTrainingCurve; we draw the `coverage` line.
  const xFor = (i) => 20 + (i / (curve.length - 1)) * 170;
  const yFor = (cov) => 120 - cov * 95;
  const path = curve.map((d, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(d.iter).toFixed(1)},${yFor(d.coverage).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={VB} style={svgFull}>
      <GridLines theme={theme} rows={5} />
      <Axes theme={theme} />
      <path
        d={path + ` L ${xFor(curve[curve.length - 1].iter)},120 L ${xFor(0)},120 Z`}
        fill={theme.pos}
        fillOpacity="0.15"
      />
      <path d={path} fill="none" stroke={theme.pos} strokeWidth="2.5">
        <animate attributeName="stroke-dasharray" from="0 500" to="500 0" dur="1.2s" fill="freeze" />
      </path>
      {curve.map((d) => (
        <g key={d.iter}>
          <circle cx={xFor(d.iter)} cy={yFor(d.coverage)} r="3" fill={theme.pos} />
          <text
            x={xFor(d.iter)}
            y={yFor(d.coverage) - 5}
            fontSize="8"
            fill={theme.fg2}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            {(d.coverage * 100).toFixed(0)}%
          </text>
          <text
            x={xFor(d.iter)}
            y="132"
            fontSize="9"
            fill={theme.fg2}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            iter {d.iter}
          </text>
        </g>
      ))}
    </svg>
  );
}
