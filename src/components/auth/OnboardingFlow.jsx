import React, { useState } from 'react';
import { SCENARIOS } from '../../data/scenarios.js';
import { useAuth, ApiError } from '../../auth';
import {
  AuthCard,
  AuthInput,
  BrahmaGreeting,
  ErrorBanner,
  PrimaryBtn,
} from './AuthShell.jsx';
import AuthShell from './AuthShell.jsx';

/**
 * Two-step onboarding rendered when a signed-in user is missing a workspace
 * or project. Both screens use the same centered-card layout as auth.
 *
 * Step 1: CreateWorkspace      — name input
 * Step 2: CreateProject        — name + scenario type picker + description
 *
 * The parent (App) decides which step to render based on the auth status.
 */

export function CreateWorkspaceScreen({ theme }) {
  const { user, createWorkspace, logout } = useAuth();
  const [name, setName] = useState(suggestWorkspaceName(user));
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      await createWorkspace(name.trim());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create workspace.');
      setSubmitting(false);
    }
  };

  return (
    <AuthShell theme={theme}>
      <AuthCard theme={theme} width={460}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BrahmaGreeting theme={theme} line2="Create your workspace." />
          <div style={{ fontSize: 13, color: theme.fg2, textAlign: 'center', marginTop: -10 }}>
            A workspace is your team's home for projects, pipelines, and reports.
            You'll be the admin.
          </div>

          {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

          <AuthInput
            theme={theme}
            label="Workspace name"
            value={name}
            onChange={setName}
            placeholder="Acme Analytics"
            autoFocus
            required
          />

          <div
            style={{
              fontSize: 11,
              color: theme.fg3,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              padding: '10px 14px',
              background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
            }}
          >
            <span style={{ color: theme.primary, fontWeight: 800 }}>NEXT&nbsp;:</span> Create
            your first project · Connect a data source · Brahma runs the pipeline.
          </div>

          <PrimaryBtn theme={theme} type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create workspace →'}
          </PrimaryBtn>

          <div style={{ fontSize: 12, color: theme.fg3, textAlign: 'center' }}>
            Signed in as <b style={{ color: theme.fg2 }}>{user?.email}</b> ·{' '}
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'none',
                border: 'none',
                color: theme.primary,
                cursor: 'pointer',
                fontWeight: 600,
                padding: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
              }}
            >
              Sign out
            </button>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

export function CreateProjectScreen({ theme }) {
  const { user, currentWorkspace, createProject, logout } = useAuth();
  const [name, setName] = useState('');
  const [scenarioType, setScenarioType] = useState('churn');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      await createProject(currentWorkspace.id, {
        name: name.trim(),
        scenario_type: scenarioType,
        description: description.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create project.');
      setSubmitting(false);
    }
  };

  return (
    <AuthShell theme={theme}>
      <AuthCard theme={theme} width={520}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BrahmaGreeting theme={theme} line2="Create your first project." />
          <div style={{ fontSize: 13, color: theme.fg2, textAlign: 'center', marginTop: -10 }}>
            In <b style={{ color: theme.fg }}>{currentWorkspace?.name}</b> · pick a scenario type
            so Brahma knows which pipeline to run.
          </div>

          {err && <ErrorBanner theme={theme}>{err}</ErrorBanner>}

          <AuthInput
            theme={theme}
            label="Project name"
            value={name}
            onChange={setName}
            placeholder="Q2 Customer Churn"
            autoFocus
            required
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.fg }}>Scenario type</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 6,
              }}
            >
              {Object.values(SCENARIOS).map((s) => {
                const active = scenarioType === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScenarioType(s.id)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${active ? theme.primary : theme.border}`,
                      background: active
                        ? theme.primary
                        : theme.bg === '#0B1020'
                        ? '#0B1020'
                        : '#F9FAFB',
                      color: active ? '#fff' : theme.fg,
                      fontFamily: 'var(--font-sans)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{s.name}</div>
                    <div
                      style={{
                        fontSize: 10,
                        opacity: 0.75,
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}
                    >
                      {s.problemType}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.fg }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project tracks, who consumes the output…"
              rows={2}
              style={{
                background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                color: theme.fg,
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <PrimaryBtn theme={theme} type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create project →'}
          </PrimaryBtn>

          <div style={{ fontSize: 12, color: theme.fg3, textAlign: 'center' }}>
            Signed in as <b style={{ color: theme.fg2 }}>{user?.email}</b> ·{' '}
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'none',
                border: 'none',
                color: theme.primary,
                cursor: 'pointer',
                fontWeight: 600,
                padding: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
              }}
            >
              Sign out
            </button>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

// Consumer email stems — covers all country variants
// (yahoo.com, yahoo.in, yahoo.co.uk, yahoo.fr, etc).
// For these, suggest "{Name}'s workspace" instead of "Gmail Analytics".
const CONSUMER_EMAIL_STEMS = new Set([
  'gmail', 'googlemail', 'ymail', 'rocketmail',
  'yahoo', 'outlook', 'hotmail', 'live', 'msn',
  'icloud', 'me', 'mac', 'proton', 'protonmail', 'pm',
  'aol', 'mail', 'gmx', 'fastmail', 'tutanota',
  'zoho', 'yandex', 'inbox', 'rediffmail',
]);

function suggestWorkspaceName(user) {
  if (!user) return '';

  const firstName = (user.name || '').trim().split(/\s+/)[0];
  const domain = (user.email || '').toLowerCase().split('@')[1] || '';
  const root = domain.split('.')[0] || '';

  // Individual sign-up → name-based workspace
  if (CONSUMER_EMAIL_STEMS.has(root) || !root || root.length < 2) {
    return firstName ? `${firstName}'s workspace` : 'My workspace';
  }

  // Company domain → "{Capitalized} Analytics"
  const cap = root.charAt(0).toUpperCase() + root.slice(1);
  return `${cap} Analytics`;
}
