/**
 * Insights deck — slide templates.
 *
 * Each template takes (slide, scenario, theme) and renders one full slide.
 * All templates honour the McKinsey "action-title" rule — the title states
 * the takeaway, never the topic.
 *
 * Layout discipline:
 *   • outer padding 56px
 *   • action title sits at top, max width 80% of slide
 *   • body content fills the middle band
 *   • footer rule: brand left, source right, page number far right
 *   • exactly ONE idea per slide
 */
import React from 'react';
import { formatValue } from '../../theme/useTheme.js';
import {
  SHAPPanel,
  ChartCard,
  ROCChart,
  PRChart,
  ConfusionMatrix,
  ResidualsChart,
  ActualVsPredicted,
  ForecastChart,
  MAPEByHorizonBars,
  PRCurveImbalanced,
  RecallAtFPRBars,
  ClusterDistributionBar,
  SilhouetteBars,
  ElbowCurve,
  AnomalyHistogram,
  ContaminationDonut,
  SelfTrainingAUCCurve,
  ConfidenceDistribution,
  CoverageVsIterations,
  BrahmaMark,
} from '../primitives';
import Leaderboard from '../report/Leaderboard.jsx';

// ──────────────────────────────────────────────────────────────────────
// Chart registry — slide kind 'finding-with-chart' uses this
// ──────────────────────────────────────────────────────────────────────

const CHART_REGISTRY = {
  roc: (scenario, theme) => <ROCChart theme={theme} />,
  pr: (scenario, theme) => <PRChart theme={theme} />,
  confusion: (scenario, theme) =>
    scenario.confusion ? <ConfusionMatrix theme={theme} c={scenario.confusion} /> : null,
  residuals: (scenario, theme) => <ResidualsChart theme={theme} />,
  actualVsPredicted: (scenario, theme) => <ActualVsPredicted theme={theme} />,
  forecast: (scenario, theme) => <ForecastChart theme={theme} />,
  mapeByHorizon: (scenario, theme) => <MAPEByHorizonBars theme={theme} />,
  prImbalanced: (scenario, theme) => <PRCurveImbalanced theme={theme} />,
  recallAtFpr: (scenario, theme) => <RecallAtFPRBars theme={theme} />,
  clusterDistribution: (scenario, theme) =>
    scenario.clusters ? <ClusterDistributionBar clusters={scenario.clusters} theme={theme} /> : null,
  silhouette: (scenario, theme) =>
    scenario.clusters ? <SilhouetteBars clusters={scenario.clusters} theme={theme} /> : null,
  elbow: (scenario, theme) => <ElbowCurve theme={theme} />,
  anomalyHistogram: (scenario, theme) => <AnomalyHistogram theme={theme} />,
  contamination: (scenario, theme) => (
    <ContaminationDonut theme={theme} contaminationPct={scenario.kpis[0]?.value ?? 2.3} />
  ),
  selfTrainingAuc: (scenario, theme) =>
    scenario.selfTrainingCurve ? (
      <SelfTrainingAUCCurve curve={scenario.selfTrainingCurve} theme={theme} />
    ) : null,
  confidenceDist: (scenario, theme) => <ConfidenceDistribution theme={theme} />,
  coverage: (scenario, theme) =>
    scenario.selfTrainingCurve ? (
      <CoverageVsIterations curve={scenario.selfTrainingCurve} theme={theme} />
    ) : null,
};

// ──────────────────────────────────────────────────────────────────────
// SlideFrame — the consistent outer container every slide uses
// ──────────────────────────────────────────────────────────────────────

function SlideFrame({ theme, children, background, padding = 56, accent = false }) {
  const bg = background || theme.card;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: bg,
        padding,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        overflow: 'hidden',
        borderLeft: accent ? `5px solid ${theme.primary}` : 'none',
      }}
    >
      {children}
    </div>
  );
}

function Kicker({ theme, children, color }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: 2.5,
        textTransform: 'uppercase',
        fontWeight: 700,
        color: color || theme.fg3,
      }}
    >
      {children}
    </div>
  );
}

function ActionTitle({ theme, size = 'lg', color, children }) {
  const fontSize = size === 'xl' ? 60 : size === 'lg' ? 44 : 32;
  return (
    <h2
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize,
        color: color || theme.fg,
        letterSpacing: -0.04 + 'em',
        lineHeight: 1.05,
        margin: 0,
        textWrap: 'balance',
      }}
    >
      {children}
    </h2>
  );
}

function SlideFooter({ theme, scenario, source, slideNum, totalSlides, light }) {
  const fg = light ? 'rgba(255,255,255,.55)' : theme.fg3;
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 14,
        borderTop: `1px solid ${light ? 'rgba(255,255,255,.18)' : theme.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 1.2,
        color: fg,
        textTransform: 'uppercase',
      }}
    >
      <BrahmaMark size={14} color={light ? '#fff' : theme.primary} />
      <span style={{ color: light ? 'rgba(255,255,255,.85)' : theme.fg2, fontWeight: 700 }}>
        BRAHMA
      </span>
      <span>· {scenario.id} ·</span>
      <span>run_{Math.floor(Date.now() / 100000) % 100000}</span>
      <span style={{ flex: 1 }} />
      {source && <span style={{ textTransform: 'none', letterSpacing: 0.6 }}>{source}</span>}
      <span style={{ marginLeft: 14, fontWeight: 700, color: light ? '#fff' : theme.fg }}>
        {String(slideNum).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Slide template registry
// ══════════════════════════════════════════════════════════════════════

export function renderSlide(slide, scenario, theme, slideNum, totalSlides) {
  const ctx = { slide, scenario, theme, slideNum, totalSlides };
  switch (slide.kind) {
    case 'cover':              return <CoverSlide {...ctx} />;
    case 'data-overview':      return <DataOverviewSlide {...ctx} />;
    case 'action-title':       return <ActionTitleSlide {...ctx} />;
    case 'finding-with-chart': return <FindingWithChartSlide {...ctx} />;
    case 'leaderboard':        return <LeaderboardSlide {...ctx} />;
    case 'performance-hero':   return <PerformanceHeroSlide {...ctx} />;
    case 'shap-deep-dive':     return <ShapDeepDiveSlide {...ctx} />;
    case 'cluster-persona':    return <ClusterPersonaSlide {...ctx} />;
    case 'recommendation':     return <RecommendationSlide {...ctx} />;
    case 'next-steps':         return <NextStepsSlide {...ctx} />;
    default:                   return null;
  }
}

// ── 1. COVER ──────────────────────────────────────────────────────────

function CoverSlide({ scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} background={theme.gradient} padding={64}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BrahmaMark size={28} color="#fff" />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: 3,
            color: 'rgba(255,255,255,.85)',
            fontWeight: 700,
          }}
        >
          BRAHMA
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: 2,
            color: 'rgba(255,255,255,.55)',
          }}
        >
          · EXECUTIVE INSIGHTS
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
        <Kicker theme={theme} color="rgba(255,255,255,.6)">
          {scenario.subtype}
        </Kicker>
        <ActionTitle theme={theme} size="xl" color="#fff">
          {scenario.name}
        </ActionTitle>
        <div
          style={{
            fontSize: 18,
            color: 'rgba(255,255,255,.85)',
            maxWidth: 720,
            lineHeight: 1.4,
            marginTop: 10,
          }}
        >
          {scenario.goal}.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 32,
          marginTop: 18,
          paddingTop: 22,
          borderTop: '1px solid rgba(255,255,255,.18)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1.2,
          color: 'rgba(255,255,255,.7)',
          textTransform: 'uppercase',
        }}
      >
        <span><span style={{ color: 'rgba(255,255,255,.45)' }}>DATASET ·</span>&nbsp;{scenario.dataset}</span>
        <span><span style={{ color: 'rgba(255,255,255,.45)' }}>ROUTED TO ·</span>&nbsp;{scenario.agent}</span>
        <span style={{ marginLeft: 'auto', color: '#fff', fontWeight: 700 }}>
          {String(slideNum).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
        </span>
      </div>
    </SlideFrame>
  );
}

// ── 2. DATA OVERVIEW ──────────────────────────────────────────────────

function DataOverviewSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>Stage 01–02 · Data ingestion + quality</Kicker>
      <ActionTitle theme={theme}>{slide.actionTitle}</ActionTitle>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {slide.stats.map((s) => (
          <StatBlock key={s.label} theme={theme} {...s} />
        ))}
      </div>

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={`Source: ${scenario.dataset}`}
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

function StatBlock({ theme, label, value, sub }) {
  return (
    <div
      style={{
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
        border: `1px solid ${theme.border}`,
        borderLeft: `3px solid ${theme.primary}`,
        borderRadius: 10,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: theme.fg,
          letterSpacing: -1,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: theme.fg2, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

// ── 3. ACTION TITLE — pure statement slide ────────────────────────────

function ActionTitleSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>The Finding</Kicker>
      <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
        <ActionTitle theme={theme} size="xl">{slide.title}</ActionTitle>
        {slide.subtitle && (
          <div
            style={{
              fontSize: 18,
              color: theme.fg2,
              lineHeight: 1.5,
              marginTop: 22,
              maxWidth: 760,
            }}
          >
            {slide.subtitle}
          </div>
        )}
      </div>
      <SlideFooter theme={theme} scenario={scenario} slideNum={slideNum} totalSlides={totalSlides} />
    </SlideFrame>
  );
}

// ── 4. FINDING WITH CHART ─────────────────────────────────────────────

function FindingWithChartSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  const chartFn = CHART_REGISTRY[slide.chart];
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>Stage 03–07 · EDA + evaluation</Kicker>
      <ActionTitle theme={theme}>{slide.title}</ActionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 32, flex: 1, minHeight: 0 }}>
        {/* Bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          {(slide.bullets || []).map((b, i) => (
            <Bullet key={i} theme={theme} index={i + 1}>
              {b}
            </Bullet>
          ))}
        </div>

        {/* Chart */}
        <div
          style={{
            background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            minHeight: 240,
          }}
        >
          {chartFn ? chartFn(scenario, theme) : (
            <div style={{ color: theme.fg3, fontSize: 12, alignSelf: 'center', margin: 'auto' }}>
              chart not available
            </div>
          )}
        </div>
      </div>

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={slide.source}
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

function Bullet({ theme, index, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 999,
          background: theme.primary,
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        {index}
      </span>
      <span style={{ fontSize: 16, color: theme.fg, lineHeight: 1.5, fontWeight: 500 }}>
        {children}
      </span>
    </div>
  );
}

// ── 5. LEADERBOARD ────────────────────────────────────────────────────

function LeaderboardSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>Stage 09 · Ensembling + selection</Kicker>
      <ActionTitle theme={theme}>{slide.title}</ActionTitle>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Leaderboard scenario={scenario} theme={theme} />
      </div>

      {slide.footnote && (
        <div
          style={{
            fontSize: 13,
            color: theme.fg2,
            lineHeight: 1.55,
            paddingLeft: 14,
            borderLeft: `3px solid ${theme.primary}`,
            fontStyle: 'italic',
          }}
        >
          <b style={{ color: theme.fg, fontStyle: 'normal' }}>So what:</b> {slide.footnote}
        </div>
      )}

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={`Source: held-out test set · Occam's razor applied`}
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

// ── 6. PERFORMANCE HERO ───────────────────────────────────────────────

function PerformanceHeroSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  const hero = scenario.kpis[slide.kpiIndex ?? 0];
  const supporting = (slide.supportingKpis || [1, 2, 3]).map((i) => scenario.kpis[i]).filter(Boolean);
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>Stage 07 · Performance</Kicker>
      <ActionTitle theme={theme}>{slide.title}</ActionTitle>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 36,
          flex: 1,
          alignItems: 'center',
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 1.5,
              color: theme.primary,
              textTransform: 'uppercase',
            }}
          >
            {hero?.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 140,
              fontWeight: 800,
              color: theme.primary,
              letterSpacing: -6,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hero ? formatValue(hero.value, hero.fmt) : '—'}
            {hero?.unit || ''}
          </div>
          <div style={{ fontSize: 14, color: theme.fg2 }}>{hero?.sub}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {supporting.map((k) => (
            <SmallKpi key={k.label} theme={theme} k={k} />
          ))}
        </div>
      </div>

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={`${scenario.finalModel} · held-out test set`}
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

function SmallKpi({ theme, k }) {
  return (
    <div
      style={{
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: '14px 18px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        {k.label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: theme.fg,
          letterSpacing: -1,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatValue(k.value, k.fmt)}
        {k.unit || ''}
      </div>
      <div style={{ fontSize: 11, color: theme.fg2, marginTop: 2 }}>{k.sub}</div>
    </div>
  );
}

// ── 7. SHAP DEEP DIVE ─────────────────────────────────────────────────

function ShapDeepDiveSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme}>Stage 07 · Explainability</Kicker>
      <ActionTitle theme={theme}>{slide.title}</ActionTitle>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SHAPPanel features={scenario.features} theme={theme} />
      </div>

      {slide.narrative && (
        <div
          style={{
            fontSize: 14,
            color: theme.fg2,
            lineHeight: 1.65,
            maxWidth: 920,
            paddingLeft: 14,
            borderLeft: `3px solid ${theme.primary}`,
          }}
        >
          {slide.narrative}
        </div>
      )}

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source="Source: SHAP values · 1,000-row sample"
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

// ── 8. CLUSTER PERSONA (clustering only) ──────────────────────────────

function ClusterPersonaSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  const cluster = (scenario.clusters || []).find((c) => c.id === slide.clusterId) || {};
  return (
    <SlideFrame theme={theme}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            background: cluster.color || theme.primary,
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1.5,
          }}
        >
          C{cluster.id}
        </span>
        <Kicker theme={theme}>
          Cluster persona · {((cluster.share || 0) * 100).toFixed(0)}% of base
        </Kicker>
      </div>

      <ActionTitle theme={theme}>{cluster.name}</ActionTitle>

      <div
        style={{
          fontSize: 22,
          color: theme.fg2,
          lineHeight: 1.45,
          maxWidth: 820,
          fontWeight: 500,
        }}
      >
        {cluster.desc}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <PersonaStat
          theme={theme}
          color={cluster.color}
          label="Share of base"
          value={`${((cluster.share || 0) * 100).toFixed(0)}%`}
        />
        <PersonaStat
          theme={theme}
          color={cluster.color}
          label="Cluster id"
          value={`C${cluster.id}`}
        />
        <PersonaStat
          theme={theme}
          color={cluster.color}
          label="Strategy"
          value={strategyLabel(cluster.name)}
        />
      </div>

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={`Cluster ${cluster.id} of ${(scenario.clusters || []).length}`}
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

function PersonaStat({ theme, color, label, value }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderLeft: `4px solid ${color || theme.primary}`,
        borderRadius: 10,
        padding: '14px 18px',
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: theme.fg,
          letterSpacing: -0.5,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function strategyLabel(name = '') {
  if (/dormant/i.test(name)) return 'Re-engage';
  if (/bargain/i.test(name)) return 'Promo-led';
  if (/mainstream/i.test(name)) return 'Cross-sell';
  if (/premium/i.test(name)) return 'Concierge';
  if (/vip/i.test(name)) return 'Account-managed';
  return 'Targeted';
}

// ── 9. RECOMMENDATION ─────────────────────────────────────────────────

function RecommendationSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} accent>
      <Kicker theme={theme} color={theme.primary}>
        Brahma's recommendation
      </Kicker>
      <ActionTitle theme={theme}>{slide.title}</ActionTitle>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
          minHeight: 0,
          justifyContent: 'center',
        }}
      >
        {(slide.actions || []).map((a, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 110px 1fr 1fr',
              gap: 18,
              padding: '16px 18px',
              background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 800,
                color: theme.primary,
                letterSpacing: 1,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 800,
                color: theme.primary,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              }}
            >
              {a.verb}
            </div>
            <div style={{ fontSize: 15, color: theme.fg, fontWeight: 600, lineHeight: 1.4 }}>
              {a.target}
            </div>
            <div style={{ fontSize: 13, color: theme.fg2, lineHeight: 1.5 }}>{a.reason}</div>
          </div>
        ))}
      </div>

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source="So what · who · why"
        slideNum={slideNum}
        totalSlides={totalSlides}
      />
    </SlideFrame>
  );
}

// ── 10. NEXT STEPS ────────────────────────────────────────────────────

function NextStepsSlide({ slide, scenario, theme, slideNum, totalSlides }) {
  return (
    <SlideFrame theme={theme} background={theme.gradient} padding={64}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BrahmaMark size={28} color="#fff" />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: 3,
            color: 'rgba(255,255,255,.85)',
            fontWeight: 700,
          }}
        >
          BRAHMA · COMPLETE
        </span>
      </div>

      <ActionTitle theme={theme} size="xl" color="#fff">
        {slide.title}
      </ActionTitle>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          marginTop: 'auto',
          marginBottom: 22,
        }}
      >
        {(slide.items || []).map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              fontSize: 18,
              color: 'rgba(255,255,255,.92)',
              lineHeight: 1.5,
              paddingLeft: 16,
              borderLeft: '2px solid rgba(255,255,255,.4)',
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,.55)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      {slide.stamp && (
        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            background: 'rgba(74, 222, 128, .18)',
            color: '#86EFAC',
            border: '1px solid rgba(74, 222, 128, .5)',
            padding: '8px 16px',
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2,
          }}
        >
          ✓ {slide.stamp}
        </div>
      )}

      <SlideFooter
        theme={theme}
        scenario={scenario}
        source={`${scenario.finalModel} · ready`}
        slideNum={slideNum}
        totalSlides={totalSlides}
        light
      />
    </SlideFrame>
  );
}
