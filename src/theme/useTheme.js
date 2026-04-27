/**
 * Theme hook + palettes — drives color and dark mode across all components.
 * Ported from the Brahma Design System prototype's primitives.jsx (PALETTES + useTheme).
 */
import { useMemo, useState, useEffect } from 'react';

export const PALETTES = {
  blue:   { primary: '#2563EB', deep: '#1E3A8A', accent: '#60A5FA', accent2: '#3B82F6' },
  indigo: { primary: '#4F46E5', deep: '#312E81', accent: '#818CF8', accent2: '#6366F1' },
  purple: { primary: '#7C3AED', deep: '#4C1D95', accent: '#A78BFA', accent2: '#8B5CF6' },
};

/**
 * Returns a fully-populated theme object with primary/deep/accent + surface/fg
 * roles + semantic colors (pos/neg/warn) + a banner gradient.
 * Light vs dark is derived from `dark`. Color family is keyed by `colorKey`.
 */
export function useTheme(colorKey, dark) {
  return useMemo(() => {
    const p = PALETTES[colorKey] || PALETTES.blue;
    const gradient = `linear-gradient(135deg, ${p.deep} 0%, ${p.primary} 55%, ${PALETTES.purple.primary} 100%)`;

    return dark
      ? {
          primary: p.primary, deep: p.deep, accent: p.accent, accent2: p.accent2,
          bg: '#0B1020', surface: '#111831', card: '#1A2238', border: '#2A3553',
          fg: '#E5E7EB', fg2: '#9CA3AF', fg3: '#6B7280',
          pos: '#4ADE80', neg: '#F87171', warn: '#FBBF24',
          gradient,
        }
      : {
          primary: p.primary, deep: p.deep, accent: p.accent, accent2: p.accent2,
          bg: '#F3F4F6', surface: '#FFFFFF', card: '#FFFFFF', border: '#E5E7EB',
          fg: '#111827', fg2: '#6B7280', fg3: '#9CA3AF',
          pos: '#16A34A', neg: '#DC2626', warn: '#D97706',
          gradient,
        };
  }, [colorKey, dark]);
}

/**
 * Count-up hook used by KPI cards. Eases a value from 0 → target over `duration` ms.
 */
export function useCountUp(target, duration = 900, deps = []) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);  // ease-out cubic
      setVal(target * e);
      if (p >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, ...deps]);
  return val;
}

/** Format a numeric value per the scenario KPI's `fmt` token. */
export function formatValue(v, fmt) {
  if (fmt === 'int')    return Math.round(v).toLocaleString();
  if (fmt === '0.0%')   return v.toFixed(1) + '%';
  if (fmt === '0.00')   return v.toFixed(2);
  if (fmt === '0.000')  return v.toFixed(3);
  if (fmt === '0.0000') return v.toFixed(4);
  if (fmt === '$0.00')  return '$' + v.toFixed(2);
  return String(v);
}
