import React from 'react';
import SlideDeck from './SlideDeck.jsx';
import { renderSlide } from './Slides.jsx';
import { getDeckForScenario } from '../../data/decks.js';
import { BrahmaMark } from '../primitives';
import { useInsights } from '../../auth';

/**
 * Public entry: renders an insights deck. Two modes:
 *   real  — runId set → call POST /api/pipelines/{id}/insights, render
 *           Claude-generated slides (cover, action-title, engine-chart,
 *           recommendation, next-steps).
 *   mock  — no runId → fall back to hardcoded scenario decks (decks.js).
 */
export default function InsightsDeck({ scenario, theme, complete, runId, hasReport }) {
  if (!complete) {
    return <NotYetReady theme={theme} scenario={scenario} />;
  }

  if (runId && hasReport) {
    return <RealInsightsDeck runId={runId} scenario={scenario} theme={theme} />;
  }

  // Mock fallback (legacy demo path)
  const slides = getDeckForScenario(scenario.id);
  if (!slides.length) {
    return (
      <div style={{ padding: 40, color: theme.fg2, fontSize: 14 }}>
        No insights deck authored for {scenario.name}.
      </div>
    );
  }
  return (
    <SlideDeck
      slides={slides}
      theme={theme}
      renderSlide={(slide, slideNum, total) =>
        renderSlide(slide, scenario, theme, slideNum, total)
      }
      exportFilename={`Brahma-${scenario.id}-Insights`}
    />
  );
}

function RealInsightsDeck({ runId, scenario, theme }) {
  const { slides, loading, error } = useInsights(runId, true);

  if (loading) return <DeckStatus theme={theme} status="generating" detail="Brahma is composing the deck — Haiku reading the run output…" />;
  if (error) return <DeckStatus theme={theme} status="error" detail={error} />;
  if (!slides || !slides.length) return <DeckStatus theme={theme} status="empty" detail="No slides returned." />;

  return (
    <SlideDeck
      slides={slides}
      theme={theme}
      renderSlide={(slide, slideNum, total) =>
        renderSlide(slide, scenario, theme, slideNum, total, runId)
      }
      exportFilename={`Brahma-${runId}-Insights`}
    />
  );
}

function DeckStatus({ theme, status, detail }) {
  const tone = status === 'error' ? theme.neg : theme.fg2;
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        flexDirection: 'column',
      }}
    >
      <BrahmaMark size={36} color={status === 'error' ? theme.neg : theme.primary} />
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 2,
          fontWeight: 700,
          color: tone,
          textTransform: 'uppercase',
        }}
      >
        Insights · {status}
      </div>
      <div style={{ fontSize: 14, color: theme.fg2, maxWidth: 420, textAlign: 'center' }}>
        {detail}
      </div>
    </div>
  );
}

function NotYetReady({ theme, scenario }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <BrahmaMark size={56} color={theme.primary} />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 2.5,
            color: theme.fg2,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          Insights deck — pending
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 800,
            color: theme.fg,
            letterSpacing: -0.4,
            lineHeight: 1.2,
            margin: 0,
            textWrap: 'balance',
          }}
        >
          Run the pipeline to unlock the executive deck.
        </h2>
        <p
          style={{
            fontSize: 14,
            color: theme.fg2,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          Brahma generates a tailored deck once the {scenario.problemType} pipeline finishes.
          Switch to the <b style={{ color: theme.fg }}>Running</b> tab and let the stages
          complete — Insights unlocks automatically.
        </p>
      </div>
    </div>
  );
}
