import React from 'react';
import { useAuth } from './auth';
import { useTheme } from './theme/useTheme.js';
import { SignInFlow, CreateWorkspaceScreen, CreateProjectScreen } from './components/auth';
import BrahmaShell from './components/BrahmaShell.jsx';
import { BrahmaMark } from './components/primitives';

/**
 * Top-level route gate.
 *
 * The auth context decides what to render:
 *   loading           → splash with brand mark
 *   anonymous         → SignInFlow (signin / signup / forgot)
 *   needs_workspace   → CreateWorkspaceScreen
 *   needs_project     → CreateProjectScreen
 *   ready             → BrahmaShell (the main app)
 *
 * Theme for the auth + onboarding screens is read once from localStorage
 * (so logging out preserves the user's color/dark-mode preference).
 */

const STORAGE_KEY = 'brahma_tweaks_v1';

function loadAuthTheme() {
  try {
    const tweaks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      primaryColor: tweaks.primaryColor || 'blue',
      dark: !!tweaks.dark,
    };
  } catch {
    return { primaryColor: 'blue', dark: false };
  }
}

export default function App() {
  const { status } = useAuth();
  const { primaryColor, dark } = loadAuthTheme();
  const theme = useTheme(primaryColor, dark);

  switch (status) {
    case 'loading':
      return <SplashScreen theme={theme} />;
    case 'anonymous':
      return <SignInFlow theme={theme} />;
    case 'needs_workspace':
      return <CreateWorkspaceScreen theme={theme} />;
    case 'needs_project':
      return <CreateProjectScreen theme={theme} />;
    case 'ready':
    default:
      return <BrahmaShell />;
  }
}

function SplashScreen({ theme }) {
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: isDark ? '#050912' : '#EEF1F5',
        backgroundImage: isDark
          ? `radial-gradient(ellipse 60% 40% at 30% 10%, ${theme.primary}30, transparent 60%),
             radial-gradient(ellipse 70% 50% at 80% 100%, #7C3AED25, transparent 60%)`
          : `radial-gradient(ellipse 60% 40% at 30% 10%, ${theme.primary}10, transparent 60%),
             radial-gradient(ellipse 70% 50% at 80% 100%, #7C3AED10, transparent 60%)`,
        fontFamily: 'var(--font-sans)',
      }}
    >
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
    </div>
  );
}
