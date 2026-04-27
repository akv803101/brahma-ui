import React from 'react';
import BrahmaMark from '../primitives/BrahmaMark.jsx';

/**
 * Layout wrapper for every auth + onboarding screen.
 * Full-page wallpaper background + centered card.
 *
 * Use AuthCard inside it for the bordered surface.
 */
export default function AuthShell({ theme, children }) {
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#050912' : '#EEF1F5',
        backgroundImage: isDark
          ? `radial-gradient(ellipse 60% 40% at 30% 10%, ${theme.primary}30, transparent 60%),
             radial-gradient(ellipse 70% 50% at 80% 100%, #7C3AED25, transparent 60%)`
          : `radial-gradient(ellipse 60% 40% at 30% 10%, ${theme.primary}10, transparent 60%),
             radial-gradient(ellipse 70% 50% at 80% 100%, #7C3AED10, transparent 60%)`,
        padding: 40,
        boxSizing: 'border-box',
        overflow: 'auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </div>
  );
}

/** Bordered card surface used by every auth / onboarding screen. */
export function AuthCard({ theme, width = 440, children }) {
  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 16,
        padding: '32px 36px',
        border: `1px solid ${theme.border}`,
        boxShadow:
          theme.bg === '#0B1020'
            ? '0 0 0 1px rgba(255,255,255,.04)'
            : '0 8px 30px rgba(17,24,39,.06)',
        width,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

/** "Brahma is awake. {line2}" header — used at top of every auth screen. */
export function BrahmaGreeting({ theme, line2 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <BrahmaMark size={56} color={theme.primary} />
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          color: theme.fg2,
        }}
      >
        Brahma is awake.
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: theme.fg,
          letterSpacing: -0.5,
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        {line2}
      </div>
    </div>
  );
}

/** Big primary action button — the "Sign in" / "Create account" / "Continue" button. */
export function PrimaryBtn({ theme, onClick, disabled, type = 'button', children }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        background: disabled ? theme.border : theme.primary,
        color: '#fff',
        border: 'none',
        padding: '13px 18px',
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'var(--font-sans)',
        letterSpacing: 0.1,
        boxShadow: disabled ? 'none' : `0 6px 16px ${theme.primary}40`,
        transition: 'opacity .15s, transform .05s',
      }}
    >
      {children}
    </button>
  );
}

/** Continue with Google — uses Google's brand colors. */
export function GoogleButton({ theme, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: theme.card,
        border: `1px solid ${theme.border}`,
        color: theme.fg,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
      }}
      title={disabled ? 'Google OAuth is not configured' : undefined}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      <span>{disabled ? 'Google sign-in unavailable' : 'Continue with Google'}</span>
    </button>
  );
}

/** "── or ──" rule used between SSO and email/password sections. */
export function Divider({ theme, label = 'or' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.fg3 }}>
      <div style={{ flex: 1, height: 1, background: theme.border }} />
      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: theme.border }} />
    </div>
  );
}

/** Standard labeled input. `mono` flips the input font to JetBrains Mono. */
export function AuthInput({
  theme,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  mono = false,
  autoComplete,
  autoFocus,
  required,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: theme.fg }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        style={{
          background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: '11px 14px',
          color: theme.fg,
          fontSize: 14,
          outline: 'none',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/** Inline error banner — red tinted card with mono caption. */
export function ErrorBanner({ theme, children }) {
  if (!children) return null;
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: isDark ? '#7F1D1D33' : '#FEE2E2',
        color: isDark ? '#FCA5A5' : '#991B1B',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.5,
        border: `1px solid ${isDark ? '#FCA5A555' : '#FCA5A5'}`,
      }}
    >
      {children}
    </div>
  );
}

/** Subtle text link — used for "Forgot password?", "Create an account", etc. */
export function TextLink({ theme, onClick, children, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: theme.primary,
        fontWeight: 600,
        fontSize: 12,
        padding: 0,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </button>
  );
}
