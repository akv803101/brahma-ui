import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { SCENARIOS, getStagesForScenario } from '../data/scenarios.js';
import { useTheme } from '../theme/useTheme.js';
import BrahmaWindow from './BrahmaWindow.jsx';
import TweaksPanel from './TweaksPanel.jsx';
import { ConnectScreen, RunningScreen, LivePredict, MemoryScreen } from './screens';
import { ReportLayoutA, ReportLayoutB, ReportLayoutC } from './report';
import { PulseDot, BrahmaMark } from './primitives';
import { useAuth } from '../auth';

// Lazy-load the Insights deck — defers framer-motion (~200 KB) and the deck
// data (~80 slide configs) until the user opens the Insights tab.
const InsightsDeck = lazy(() => import('./insights/InsightsDeck.jsx'));

/**
 * The main app surface — the macOS-style window with the 4 tabs (Connect /
 * Running / Report / Live Predict). Renders only after the user has signed
 * in AND has at least one workspace + project.
 *
 * Tweaks state (color, dark mode, scenario, layout, stage scrubber) is
 * persisted to localStorage so refreshes feel sticky.
 */

const REPORT_LAYOUTS = { A: ReportLayoutA, B: ReportLayoutB, C: ReportLayoutC };

const TWEAK_DEFAULTS = {
  primaryColor: 'blue',
  dark: false,
  scenario: 'churn',
  stageIdx: 0,
  layout: 'A',
};

const STORAGE_KEY = 'brahma_tweaks_v1';
const SCREEN_KEY = 'brahma_screen_v1';

function loadTweaks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...TWEAK_DEFAULTS, ...stored };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

export default function BrahmaShell() {
  const { currentProject } = useAuth();

  // If the project has a scenario_type set, prefer that on first load
  const [tweaks, setTweaksState] = useState(() => {
    const base = loadTweaks();
    if (currentProject?.scenario_type && SCENARIOS[currentProject.scenario_type]) {
      return { ...base, scenario: currentProject.scenario_type };
    }
    return base;
  });

  const [screen, setScreenState] = useState(
    () => localStorage.getItem(SCREEN_KEY) || 'connect'
  );

  const setTweaks = (patch) => {
    setTweaksState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const setScreen = (s) => {
    setScreenState(s);
    try {
      localStorage.setItem(SCREEN_KEY, s);
    } catch {}
  };

  const scenario = SCENARIOS[tweaks.scenario] || SCENARIOS.churn;
  const stages = getStagesForScenario(scenario);
  const theme = useTheme(tweaks.primaryColor, tweaks.dark);

  // Reset stageIdx when scenario changes
  useEffect(() => {
    setTweaksState((prev) => ({ ...prev, stageIdx: 0 }));
  }, [tweaks.scenario]);

  // Auto-advance stages while Running screen is open
  const intervalRef = useRef(null);
  useEffect(() => {
    if (screen !== 'running') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    if (tweaks.stageIdx >= stages.length) return;
    intervalRef.current = setInterval(() => {
      setTweaksState((prev) => {
        const max = stages.length;
        const next = prev.stageIdx < max ? prev.stageIdx + 1 : prev.stageIdx;
        const updated = { ...prev, stageIdx: next };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }, 700);
    return () => clearInterval(intervalRef.current);
  }, [screen, stages.length, tweaks.stageIdx, tweaks.scenario]);

  const ReportComponent = REPORT_LAYOUTS[tweaks.layout] || ReportLayoutA;

  const useRunAsTemplate = (run) => {
    if (run?.scenario_id && SCENARIOS[run.scenario_id]) {
      setTweaks({ scenario: run.scenario_id, stageIdx: 0 });
      setScreen('connect');
    }
  };

  const openInsightsForRun = (run) => {
    if (run?.scenario_id && SCENARIOS[run.scenario_id]) {
      const stagesForRun = getStagesForScenario(SCENARIOS[run.scenario_id]);
      setTweaks({ scenario: run.scenario_id, stageIdx: stagesForRun.length });
      setScreen('insights');
    }
  };

  const body = (() => {
    switch (screen) {
      case 'connect':
        return (
          <ConnectScreen
            scenario={scenario}
            theme={theme}
            onStart={() => {
              setTweaks({ stageIdx: 0 });
              setScreen('running');
            }}
            onUseTemplate={useRunAsTemplate}
          />
        );
      case 'running':
        return (
          <RunningScreen
            scenario={scenario}
            theme={theme}
            stageIdx={tweaks.stageIdx}
            onComplete={() => setScreen('report')}
          />
        );
      case 'report':
        return (
          <ReportComponent
            scenario={scenario}
            theme={theme}
            stageIdx={tweaks.stageIdx}
          />
        );
      case 'insights':
        return (
          <Suspense fallback={<InsightsLoading theme={theme} />}>
            <InsightsDeck
              scenario={scenario}
              theme={theme}
              complete={tweaks.stageIdx >= stages.length}
            />
          </Suspense>
        );
      case 'live':
        return <LivePredict scenario={scenario} theme={theme} />;
      case 'memory':
        return (
          <MemoryScreen
            theme={theme}
            onUseAsTemplate={useRunAsTemplate}
            onOpenInsights={openInsightsForRun}
          />
        );
      default:
        return null;
    }
  })();

  const rightAccessory =
    screen === 'running' ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        <PulseDot
          color={tweaks.stageIdx >= stages.length ? theme.pos : theme.primary}
          size={7}
        />
        <span style={{ fontSize: 11, color: theme.fg2, fontFamily: 'var(--font-mono)' }}>
          {tweaks.stageIdx >= stages.length
            ? 'complete'
            : `running · ${tweaks.stageIdx}/${stages.length}`}
        </span>
      </div>
    ) : null;

  return (
    <div className={'desktop' + (tweaks.dark ? ' dark' : '')}>
      <BrahmaWindow
        theme={theme}
        scenario={scenario}
        screen={screen}
        setScreen={setScreen}
        stageIdx={tweaks.stageIdx}
        rightAccessory={rightAccessory}
      >
        {body}
      </BrahmaWindow>
      <TweaksPanel state={tweaks} setState={setTweaks} />
    </div>
  );
}

function InsightsLoading({ theme }) {
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
      <BrahmaMark size={36} color={theme.primary} />
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 2,
          fontWeight: 700,
          color: theme.fg2,
          textTransform: 'uppercase',
        }}
      >
        Loading deck…
      </div>
    </div>
  );
}
