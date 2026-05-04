import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { SCENARIOS, getStagesForScenario } from '../data/scenarios.js';
import { useTheme } from '../theme/useTheme.js';
import BrahmaWindow from './BrahmaWindow.jsx';
import TweaksPanel from './TweaksPanel.jsx';
import { ConnectScreen, RunningScreen, LivePredict, MemoryScreen } from './screens';
import { ReportLayoutA, ReportLayoutB, ReportLayoutC } from './report';
import { PulseDot, BrahmaMark } from './primitives';
import { useAuth, pipelinesApi, ApiError, useReport } from '../auth';

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
  const [realRunId, setRealRunId] = useState(null);
  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);

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

  // Fetch the real-engine report once the run lands on the Report tab.
  const reportRunId = realRunId && (screen === 'report' || screen === 'insights') ? realRunId : null;
  const { report } = useReport(reportRunId);

  // Reset stageIdx when scenario changes
  useEffect(() => {
    setTweaksState((prev) => ({ ...prev, stageIdx: 0 }));
  }, [tweaks.scenario]);

  // Mock auto-advance — disabled when a real run is active.
  // Kept for back-compat scenario demos until D2c removes it entirely.
  const intervalRef = useRef(null);
  useEffect(() => {
    if (screen !== 'running' || realRunId) {
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
  }, [screen, stages.length, tweaks.stageIdx, tweaks.scenario, realRunId]);

  const ReportComponent = REPORT_LAYOUTS[tweaks.layout] || ReportLayoutA;

  const useRunAsTemplate = (run) => {
    if (run?.scenario_id && SCENARIOS[run.scenario_id]) {
      setTweaks({ scenario: run.scenario_id, stageIdx: 0 });
      setScreen('connect');
    }
  };

  /**
   * Real-engine start. Posts to /api/pipelines with sourceConfig.type='file'
   * pointing at the bundled credit_card_customers.csv (D2 scope: single source;
   * E adds Postgres, F adds Snowflake/BigQuery/S3/Sheets/REST).
   */
  const startRealRun = async () => {
    if (!currentProject) {
      setStartError('Pick a project first.');
      return;
    }
    setStartError(null);
    setStarting(true);
    try {
      const result = await pipelinesApi.start({
        projectId: currentProject.id,
        goal: scenario.goal,
        sourceConfig: {
          type: 'file',
          filename: 'credit_card_customers.csv',
          temp_path: 'data/credit_card_customers.csv',
        },
      });
      setRealRunId(result.runId);
      setTweaks({ stageIdx: 0 });
      setScreen('running');
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Failed to start pipeline.');
    } finally {
      setStarting(false);
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
            onStart={startRealRun}
            starting={starting}
            startError={startError}
            onUseTemplate={useRunAsTemplate}
          />
        );
      case 'running':
        return (
          <RunningScreen
            scenario={scenario}
            theme={theme}
            stageIdx={tweaks.stageIdx}
            runId={realRunId}
            onComplete={() => setScreen('report')}
          />
        );
      case 'report':
        return (
          <ReportComponent
            scenario={scenario}
            theme={theme}
            stageIdx={tweaks.stageIdx}
            report={report}
            runId={realRunId}
          />
        );
      case 'insights':
        return (
          <Suspense fallback={<InsightsLoading theme={theme} />}>
            <InsightsDeck
              scenario={scenario}
              theme={theme}
              complete={realRunId ? !!report : tweaks.stageIdx >= stages.length}
              runId={realRunId}
              hasReport={!!report}
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
