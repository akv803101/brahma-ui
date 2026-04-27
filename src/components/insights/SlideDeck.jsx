import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Deck shell — owns navigation, keyboard handling, fullscreen, and the
 * framer-motion fade between slides. Slide rendering is delegated to
 * the `renderSlide` callback so the shell stays template-agnostic.
 *
 * Keyboard:
 *   ← / →           prev / next
 *   Home / End      first / last
 *   F               toggle fullscreen
 *   Esc             exit fullscreen
 */
export default function SlideDeck({ slides, theme, renderSlide }) {
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef(null);

  const total = slides.length;
  const safeIndex = Math.min(index, total - 1);

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (i) => {
      setIndex(Math.max(0, Math.min(i, total - 1)));
    },
    [total]
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(total - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goTo, total]);

  // Track native fullscreen state (user can exit with browser ESC)
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  if (!total) {
    return (
      <div style={{ padding: 40, color: theme.fg2, fontSize: 14 }}>
        No insights deck for this scenario.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: fullscreen ? '40px 60px' : '8px',
        boxSizing: 'border-box',
      }}
    >
      {/* Slide stage */}
      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: fullscreen ? 1600 : 1280,
          aspectRatio: '16 / 9',
          minHeight: 0,
          background: theme.card,
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          boxShadow:
            theme.bg === '#0B1020'
              ? '0 0 0 1px rgba(255,255,255,.04)'
              : '0 12px 40px rgba(17,24,39,.10)',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={safeIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ width: '100%', height: '100%' }}
          >
            {renderSlide(slides[safeIndex], safeIndex + 1, total)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <DeckControls
        theme={theme}
        index={safeIndex}
        total={total}
        next={next}
        prev={prev}
        goTo={goTo}
        toggleFullscreen={toggleFullscreen}
        fullscreen={fullscreen}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Controls — dots, prev/next, slide counter, fullscreen
// ──────────────────────────────────────────────────────────────────────

function DeckControls({ theme, index, total, next, prev, goTo, toggleFullscreen, fullscreen }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        borderRadius: 999,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.bg === '#0B1020' ? 'none' : '0 4px 12px rgba(17,24,39,.06)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <NavButton theme={theme} disabled={index === 0} onClick={prev} aria-label="Previous slide">
        ←
      </NavButton>

      <div
        style={{
          display: 'flex',
          gap: 5,
          alignItems: 'center',
          padding: '0 6px',
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const active = i === index;
          return (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: active ? 18 : 7,
                height: 7,
                borderRadius: 999,
                background: active ? theme.primary : theme.border,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all .15s',
              }}
            />
          );
        })}
      </div>

      <NavButton
        theme={theme}
        disabled={index === total - 1}
        onClick={next}
        aria-label="Next slide"
      >
        →
      </NavButton>

      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: theme.fg2,
          letterSpacing: 1,
          fontWeight: 700,
          padding: '0 6px',
          minWidth: 64,
          textAlign: 'center',
        }}
      >
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>

      <div style={{ width: 1, height: 18, background: theme.border }} />

      <button
        onClick={toggleFullscreen}
        title={fullscreen ? 'Exit fullscreen (ESC)' : 'Enter fullscreen (F)'}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 6,
          color: theme.fg2,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {fullscreen ? '↙ EXIT' : '↗ PRESENT'}
      </button>
    </div>
  );
}

function NavButton({ theme, onClick, disabled, children, ...rest }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...rest}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${theme.border}`,
        background: disabled ? 'transparent' : theme.card,
        color: disabled ? theme.fg3 : theme.fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background .15s, opacity .15s',
      }}
    >
      {children}
    </button>
  );
}
