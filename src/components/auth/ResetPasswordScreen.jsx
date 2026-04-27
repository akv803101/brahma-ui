import React, { useState } from 'react';
import { ApiError, authApi } from '../../auth';
import {
  AuthCard,
  AuthInput,
  BrahmaGreeting,
  ErrorBanner,
  PrimaryBtn,
  TextLink,
} from './AuthShell.jsx';
import AuthShell from './AuthShell.jsx';

/**
 * Activates when ?reset=<token> is in the URL.
 * Submits the new password to /api/auth/reset-password and on success
 * strips the query, sends the user back to sign-in with a confirmation state.
 */
export default function ResetPasswordScreen({ theme, token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setErr('');
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : 'Reset link is invalid or has expired. Request a new one.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell theme={theme}>
        <AuthCard theme={theme}>
          <BrahmaGreeting theme={theme} line2="Password reset." />
          <div
            style={{
              padding: '14px 16px',
              background: theme.bg === '#0B1020' ? '#14532D22' : '#F0FDF4',
              border: `1px solid ${theme.pos}55`,
              borderRadius: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: theme.fg2,
              lineHeight: 1.7,
            }}
          >
            <div style={{ color: theme.pos, fontWeight: 800, letterSpacing: 1.5 }}>UPDATED</div>
            <div>Your password has been changed. Sign in with the new one.</div>
          </div>
          <PrimaryBtn theme={theme} onClick={onDone}>Back to sign in →</PrimaryBtn>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell theme={theme}>
      <AuthCard theme={theme}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BrahmaGreeting theme={theme} line2="Choose a new password." />
          <div style={{ fontSize: 13, color: theme.fg2, textAlign: 'center', marginTop: -10 }}>
            Reset link valid for 30 minutes. Use a fresh password Brahma will recognise.
          </div>

          {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

          <AuthInput
            theme={theme}
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            autoFocus
            required
          />
          <AuthInput
            theme={theme}
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Type it again"
            autoComplete="new-password"
            required
          />

          <PrimaryBtn theme={theme} type="submit" disabled={submitting || !password || !confirm}>
            {submitting ? 'Resetting…' : 'Reset password →'}
          </PrimaryBtn>

          <div style={{ fontSize: 12, color: theme.fg3, textAlign: 'center' }}>
            <TextLink theme={theme} onClick={onDone}>← Back to sign in</TextLink>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
