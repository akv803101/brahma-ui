import React, { useEffect, useState } from 'react';
import { useAuth, ApiError, authApi } from '../../auth';
import {
  AuthCard,
  AuthInput,
  BrahmaGreeting,
  Divider,
  ErrorBanner,
  GoogleButton,
  PrimaryBtn,
  TextLink,
} from './AuthShell.jsx';
import AuthShell from './AuthShell.jsx';

/**
 * Three-screen flow rendered before the main app:
 *   • signin  — email + password + Google
 *   • signup  — name + email + password
 *   • forgot  — email → success toast (UI-only for now)
 *
 * Reads the `?signin=ok|error` query string left by the OAuth callback
 * and surfaces the result as a banner / refresh.
 */
export default function SignInFlow({ theme }) {
  const { login, signup, googleSignIn, googleEnabled, refresh } = useAuth();
  const [mode, setMode] = useState('signin');
  const [oauthMessage, setOauthMessage] = useState(null);

  // Process the OAuth-callback redirect (?signin=ok | ?signin=error&reason=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('signin');
    if (!status) return;

    if (status === 'ok') {
      // Cookie was set on the server's redirect — pull the new session
      refresh();
    } else if (status === 'error') {
      setOauthMessage({
        kind: 'error',
        text:
          'Google sign-in failed: ' +
          (params.get('reason') || 'unknown error') +
          '. Please try again or use email + password.',
      });
    }
    // Strip the params from the URL so refreshes don't re-trigger
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
  }, [refresh]);

  const onGoogle = () => {
    if (!googleEnabled) return;
    googleSignIn();
  };

  return (
    <AuthShell theme={theme}>
      <AuthCard theme={theme} width={mode === 'signup' ? 460 : 440}>
        {mode === 'signin' && (
          <SignIn
            theme={theme}
            onLogin={login}
            onGoogle={onGoogle}
            googleEnabled={googleEnabled}
            switchTo={setMode}
            oauthMessage={oauthMessage}
            clearOauthMessage={() => setOauthMessage(null)}
          />
        )}
        {mode === 'signup' && (
          <SignUp
            theme={theme}
            onSignup={signup}
            onGoogle={onGoogle}
            googleEnabled={googleEnabled}
            switchTo={setMode}
          />
        )}
        {mode === 'forgot' && <Forgot theme={theme} switchTo={setMode} />}
      </AuthCard>
    </AuthShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sign in
// ─────────────────────────────────────────────────────────────────────────

function SignIn({ theme, onLogin, onGoogle, googleEnabled, switchTo, oauthMessage, clearOauthMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    clearOauthMessage();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign in failed.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BrahmaGreeting theme={theme} line2="Sign in to continue." />

      {oauthMessage && <ErrorBanner theme={theme}>{oauthMessage.text}</ErrorBanner>}
      {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

      <GoogleButton theme={theme} onClick={onGoogle} disabled={!googleEnabled} />

      <Divider theme={theme} />

      <AuthInput
        theme={theme}
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        autoComplete="email"
        autoFocus
        required
        mono
      />

      <AuthInput
        theme={theme}
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -10 }}>
        <TextLink theme={theme} onClick={() => switchTo('forgot')}>
          Forgot password?
        </TextLink>
      </div>

      <PrimaryBtn theme={theme} type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in →'}
      </PrimaryBtn>

      <div style={{ fontSize: 13, color: theme.fg3, textAlign: 'center' }}>
        New to Brahma?{' '}
        <TextLink theme={theme} onClick={() => switchTo('signup')}>
          Create an account
        </TextLink>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sign up
// ─────────────────────────────────────────────────────────────────────────

function SignUp({ theme, onSignup, onGoogle, googleEnabled, switchTo }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await onSignup(email, password, name);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign up failed.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BrahmaGreeting theme={theme} line2="Create your account." />
      <div style={{ fontSize: 13, color: theme.fg2, textAlign: 'center', marginTop: -10 }}>
        Free for 14 days. No credit card.
      </div>

      {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

      <GoogleButton theme={theme} onClick={onGoogle} disabled={!googleEnabled} />

      <Divider theme={theme} />

      <AuthInput
        theme={theme}
        label="Full name"
        value={name}
        onChange={setName}
        placeholder="Anika Verma"
        autoComplete="name"
        autoFocus
        required
      />

      <AuthInput
        theme={theme}
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        autoComplete="email"
        required
        mono
      />

      <AuthInput
        theme={theme}
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
      />

      <div style={{ fontSize: 11, color: theme.fg3, lineHeight: 1.5 }}>
        By continuing, you agree to Brahma's <b style={{ color: theme.primary }}>Terms</b> and{' '}
        <b style={{ color: theme.primary }}>Privacy Policy</b>.
      </div>

      <PrimaryBtn theme={theme} type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account →'}
      </PrimaryBtn>

      <div style={{ fontSize: 13, color: theme.fg3, textAlign: 'center' }}>
        Already have an account?{' '}
        <TextLink theme={theme} onClick={() => switchTo('signin')}>
          Sign in
        </TextLink>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Forgot password — UI only (no real email send yet)
// ─────────────────────────────────────────────────────────────────────────

function Forgot({ theme, switchTo }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setErr('');
    setSubmitting(true);
    try {
      await authApi.forgot(email);
      setSent(true);
    } catch (e) {
      // Backend returns 204 even when email doesn't exist (no enumeration leak),
      // so this only fires on network / server errors. Surface the same generic
      // success message — silent failure is worse UX than an honest "try again".
      setErr(e instanceof ApiError ? e.message : 'Could not send reset link. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BrahmaGreeting theme={theme} line2={sent ? 'Check your email.' : 'Reset your password.'} />

      {!sent ? (
        <>
          <div style={{ fontSize: 13, color: theme.fg2, textAlign: 'center', marginTop: -10 }}>
            Enter the email you signed up with. We'll send a one-time reset link.
          </div>

          {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

          <AuthInput
            theme={theme}
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
            mono
          />
          <PrimaryBtn theme={theme} type="submit" disabled={submitting || !email}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </PrimaryBtn>
        </>
      ) : (
        <>
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
            <div style={{ color: theme.pos, fontWeight: 800, letterSpacing: 1.5 }}>SENT</div>
            <div>If we have an account for {email}, a reset link is on its way. The link expires in 30 minutes.</div>
          </div>
          <PrimaryBtn theme={theme} onClick={() => switchTo('signin')}>
            Back to sign in
          </PrimaryBtn>
        </>
      )}

      <div style={{ fontSize: 13, color: theme.fg3, textAlign: 'center' }}>
        <TextLink theme={theme} onClick={() => switchTo('signin')}>
          ← Back to sign in
        </TextLink>
      </div>
    </form>
  );
}
