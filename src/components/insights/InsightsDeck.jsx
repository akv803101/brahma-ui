import React from 'react';
import SlideDeck from './SlideDeck.jsx';
import { renderSlide } from './Slides.jsx';
import { getDeckForScenario } from '../../data/decks.js';
import { BrahmaMark } from '../primitives';

/**
 * Public entry: takes scenario + theme + completion gate, renders the
 * scenario-specific deck (10–15 slides), or a placeholder when not yet
 * unlocked.
 */
export default function InsightsDeck({ scenario, theme, complete }) {
  if (!complete) {
    return <NotYetReady theme={theme} scenario={scenario} />;
  }

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
    />
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
          Switch to the <b style={{ color: theme.fg }}>Running</b> tab and let the 13 stages
          complete — Insights unlocks automatically.
        </p>
      </div>
    </div>
  );
}
