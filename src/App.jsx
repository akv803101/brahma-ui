import React, { useState, useEffect, useRef } from 'react';
import { SCENARIOS, getStagesForScenario } from './data/scenarios.js';
import { useTheme } from './theme/useTheme.js';
import BrahmaWindow from './components/BrahmaWindow.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import { ConnectScreen, RunningScreen, LivePredict } from './components/screens';
import { ReportLayoutA, ReportLayoutB, ReportLayoutC } from './components/report';
import { PulseDot } from './components/primitives';

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

export default function App() {
  const [tweaks, setTweaksState] = useState(loadTweaks);
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

  // Reset stageIdx when scenario changes (different stage set)
  useEffect(() => {
    setTweaksState((prev) => ({ ...prev, stageIdx: 0 }));
  }, [tweaks.scenario]);

  // Auto-advance stages while Running screen is open and not yet complete
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
          />
        );
      case 'running':
        return (
          <RunningScreen
            scenario={scenario}
            theme={theme}
            stageIdx={tweaks.stageIdx}
            onComplete={() => {
              // Auto-advance to report when the pipeline finishes
              setScreen('report');
            }}
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
      case 'live':
        return <LivePredict scenario={scenario} theme={theme} />;
      default:
        return null;
    }
  })();

  // Right-side tab-bar accessory — stage pill while running
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
