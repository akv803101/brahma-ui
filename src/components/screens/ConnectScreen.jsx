import React, { useState, useEffect } from 'react';
import { CheckIcon } from '../primitives/Icons.jsx';
import { getStagesForScenario } from '../../data/scenarios.js';
import SimilarRunsPanel from './SimilarRunsPanel.jsx';
import { pipelinesApi, ApiError } from '../../auth';

/**
 * Connect screen — three sequentially-gated steps:
 *   01 · Pick a data source + fill connection fields, click Test connection
 *   02 · State the goal in plain English (pre-filled from scenario)
 *   03 · Brahma echoes back what it understood, Start the pipeline
 *
 * Source list mirrors the 9 enterprise data sources from the design system.
 */

/**
 * Each entry maps a UI choice → backend sourceConfig payload.
 *  - id:      UI key (used by SourceIcon switch)
 *  - label:   what the user sees in the dropdown
 *  - hint:    one-line right-hand caption
 *  - backend: the type sent to /api/pipelines (POST) and test-connection
 *  - fields:  ordered list { key, label, def, secret?, placeholder? }
 *             — `key` is the EXACT field name the backend expects
 *  - liveProbe: true if /api/pipelines/test-connection actually probes
 *               (file/postgresql/sqlite). Other sources validate only
 *               in chunk E; live probes ship in chunk F.
 */
const DATA_SOURCES = [
  {
    id: 'csv',
    label: 'Local CSV file',
    hint: 'bundled credit_card_customers.csv',
    backend: 'file',
    liveProbe: true,
    fields: [
      { key: 'filename',  label: 'Filename',                       def: 'credit_card_customers.csv' },
      { key: 'temp_path', label: 'Path (relative to vendor/brahma)', def: 'data/credit_card_customers.csv' },
    ],
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    hint: 'host · db · table',
    backend: 'postgresql',
    liveProbe: true,
    fields: [
      { key: 'host',           label: 'Host',           def: 'localhost' },
      { key: 'port',           label: 'Port',           def: '5432' },
      { key: 'database',       label: 'Database',       def: 'analytics' },
      { key: 'user',           label: 'User',           def: 'postgres' },
      { key: 'password',       label: 'Password',       def: '', secret: true },
      { key: 'table_or_query', label: 'Table or SELECT', def: 'public.credit_card_customers' },
    ],
  },
  {
    id: 'sqlite',
    label: 'SQLite (local)',
    hint: 'absolute path · table',
    backend: 'sqlite',
    liveProbe: true,
    fields: [
      { key: 'path',           label: 'DB path', def: '' },
      { key: 'table_or_query', label: 'Table',   def: 'users' },
    ],
  },
  {
    id: 'snowflake',
    label: 'Snowflake (validation only)',
    hint: 'shipping in chunk F',
    backend: 'snowflake',
    liveProbe: false,
    fields: [
      { key: 'account',        label: 'Account',         def: 'acme-prod.us-east-1' },
      { key: 'user',           label: 'User',            def: '' },
      { key: 'password',       label: 'Password',        def: '', secret: true },
      { key: 'warehouse',      label: 'Warehouse',       def: 'ANALYTICS_WH' },
      { key: 'database',       label: 'Database',        def: '' },
      { key: 'schema',         label: 'Schema',          def: 'PUBLIC' },
      { key: 'table_or_query', label: 'Table or SELECT', def: 'CUSTOMERS' },
    ],
  },
  {
    id: 'bigquery',
    label: 'BigQuery (validation only)',
    hint: 'shipping in chunk F',
    backend: 'bigquery',
    liveProbe: false,
    fields: [
      { key: 'project',          label: 'Project',          def: '' },
      { key: 'dataset',          label: 'Dataset',          def: '' },
      { key: 'table_or_query',   label: 'Table or SELECT',  def: '' },
      { key: 'credentials_json', label: 'Service account JSON', def: '', secret: true },
    ],
  },
  {
    id: 's3',
    label: 'Amazon S3 (validation only)',
    hint: 'shipping in chunk F',
    backend: 's3',
    liveProbe: false,
    fields: [
      { key: 'bucket',      label: 'Bucket',      def: '' },
      { key: 'key',         label: 'Key',         def: '' },
      { key: 'region',      label: 'Region',      def: 'us-east-1' },
      { key: 'file_format', label: 'Format',      def: 'parquet' },
      { key: 'access_key',  label: 'Access key',  def: '' },
      { key: 'secret_key',  label: 'Secret key',  def: '', secret: true },
    ],
  },
  {
    id: 'gsheet',
    label: 'Google Sheets (validation only)',
    hint: 'shipping in chunk F',
    backend: 'google_sheets',
    liveProbe: false,
    fields: [
      { key: 'url',              label: 'Sheet URL',            def: '' },
      { key: 'tab',              label: 'Tab',                  def: 'Sheet1' },
      { key: 'credentials_json', label: 'Service account JSON', def: '', secret: true },
    ],
  },
  {
    id: 'api',
    label: 'HTTP / REST (validation only)',
    hint: 'shipping in chunk F',
    backend: 'rest_api',
    liveProbe: false,
    fields: [
      { key: 'url',    label: 'Endpoint URL', def: 'https://api.example.com/v2/customers' },
      { key: 'method', label: 'Method',       def: 'GET' },
    ],
  },
];

function buildSourceConfig(source, fieldVals) {
  const cfg = { type: source.backend };
  for (const f of source.fields) {
    let v = fieldVals[f.key];
    if (v === undefined || v === '') continue;
    // Coerce port to number for postgres/mysql so backend's int() doesn't choke
    if (f.key === 'port') v = Number(v) || v;
    cfg[f.key] = v;
  }
  return cfg;
}

function SourceIcon({ id, color, size = 18 }) {
  const common = { width: size, height: size, style: { flexShrink: 0 } };
  switch (id) {
    case 'snowflake':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 2v20M2 12h20M4.5 4.5l15 15M19.5 4.5l-15 15" />
        </svg>
      );
    case 'postgres':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      );
    case 'bigquery':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="M16 16l5 5" strokeLinecap="round" />
        </svg>
      );
    case 'databricks':
      return (
        <svg {...common} viewBox="0 0 24 24" fill={color}>
          <path d="M2 17 L12 22 L22 17 L20 16 L12 20 L4 16 Z" />
          <path opacity=".7" d="M2 12 L12 17 L22 12 L20 11 L12 15 L4 11 Z" />
          <path opacity=".45" d="M2 7 L12 12 L22 7 L12 2 Z" />
        </svg>
      );
    case 's3':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
      );
    case 'redshift':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 19V9l8-5 8 5v10" />
          <path d="M9 19v-7h6v7" />
        </svg>
      );
    case 'gsheet':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M4 9h16M4 15h16M10 3v18" />
        </svg>
      );
    case 'api':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
          <path d="M10 14L4 20M14 10l6-6M8 4h4M4 8v4M20 16v4M16 20h4" />
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    default: // csv / local file
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

function StepCard({ theme, n, title, children, done = false, disabled = false }) {
  const isDark = theme.bg === '#0B1020';
  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 14,
        border: `1px solid ${done ? theme.pos + '55' : theme.border}`,
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity .2s, border-color .2s',
      }}
    >
      <div
        style={{
          padding: '14px 22px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: done ? (isDark ? '#14532D22' : '#F0FDF4') : 'transparent',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: done ? theme.pos : theme.primary,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {done ? <CheckIcon color="#fff" /> : n}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.fg, flex: 1 }}>{title}</div>
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </div>
  );
}

export default function ConnectScreen({ scenario, theme, onStart, onUseTemplate, starting = false, startError = null }) {
  const isDark = theme.bg === '#0B1020';
  const [sourceId, setSourceId] = useState('csv');
  const source = DATA_SOURCES.find((s) => s.id === sourceId) || DATA_SOURCES[0];

  const [fieldVals, setFieldVals] = useState(() =>
    Object.fromEntries(source.fields.map((f) => [f.key, f.def]))
  );
  useEffect(() => {
    setFieldVals(Object.fromEntries(source.fields.map((f) => [f.key, f.def])));
    setProbe({ status: 'idle', message: '', sample: null });
  }, [sourceId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [goal, setGoal] = useState(scenario.goal);
  // Probe state: { status: 'idle' | 'testing' | 'ok' | 'error', message, sample }
  const [probe, setProbe] = useState({ status: 'idle', message: '', sample: null });

  useEffect(() => {
    setGoal(scenario.goal);
    setProbe({ status: 'idle', message: '', sample: null });
  }, [scenario.id]);

  const connected = probe.status === 'ok';
  const step1Done = connected;
  const step2Done = connected && goal.trim().length > 10;

  const handleTestConnection = async () => {
    setProbe({ status: 'testing', message: '', sample: null });
    const sourceConfig = buildSourceConfig(source, fieldVals);
    try {
      const res = await pipelinesApi.testConnection({ sourceConfig });
      setProbe({
        status: res.ok ? 'ok' : 'error',
        message: res.message || (res.ok ? 'Connected.' : 'Connection failed.'),
        sample: res.sample || null,
      });
    } catch (e) {
      setProbe({
        status: 'error',
        message: e instanceof ApiError ? e.message : 'Network error.',
        sample: null,
      });
    }
  };

  const handleStart = () => {
    if (!step2Done) return;
    const sourceConfig = buildSourceConfig(source, fieldVals);
    onStart?.({ sourceConfig, goal });
  };

  const stages = getStagesForScenario(scenario);
  const inputBg = isDark ? '#0B1020' : '#F9FAFB';

  return (
    <div
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '32px 24px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img
          src="/assets/brahma-mark-blue.svg"
          alt=""
          style={{ width: 44, height: 44, flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: theme.fg2,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Brahma is awake.
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: theme.fg,
              letterSpacing: -0.3,
              lineHeight: 1.2,
              marginTop: 2,
            }}
          >
            Connect a source. State a goal. Nothing else.
          </div>
        </div>
      </div>

      {/* ─── STEP 1 · Data source ──────────────────────────────────── */}
      <StepCard theme={theme} n="01" title="Connect your data source" done={step1Done}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: theme.fg,
            letterSpacing: 0.2,
            marginBottom: 8,
          }}
        >
          Source type
        </div>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <div
            style={{
              background: inputBg,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <SourceIcon id={sourceId} color={theme.primary} />
            <select
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setConnected(false);
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: theme.fg,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                appearance: 'none',
                WebkitAppearance: 'none',
                cursor: 'pointer',
              }}
            >
              {DATA_SOURCES.map((s) => (
                <option key={s.id} value={s.id} style={{ background: theme.card, color: theme.fg }}>
                  {s.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: theme.fg3, fontFamily: 'var(--font-mono)' }}>
              {source.hint}
            </span>
            <span style={{ color: theme.fg2, fontSize: 10, marginLeft: 4 }}>▼</span>
          </div>
        </div>

        {/* Source-specific fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {source.fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 11, fontWeight: 600, color: theme.fg2, marginBottom: 4 }}>
                {f.label}
              </div>
              <input
                type={f.secret ? 'password' : 'text'}
                value={fieldVals[f.key] ?? ''}
                onChange={(e) => {
                  setFieldVals((v) => ({ ...v, [f.key]: e.target.value }));
                  setProbe({ status: 'idle', message: '', sample: null });
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: inputBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  outline: 'none',
                  color: theme.fg,
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleTestConnection}
            disabled={probe.status === 'testing'}
            style={{
              background: connected ? (isDark ? '#14532D' : '#DCFCE7') : theme.card,
              color: connected ? theme.pos : probe.status === 'error' ? theme.neg : theme.fg,
              border: `1px solid ${
                connected ? theme.pos + '55' : probe.status === 'error' ? theme.neg + '55' : theme.border
              }`,
              borderRadius: 8,
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              cursor: probe.status === 'testing' ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {probe.status === 'testing' && <span>Testing…</span>}
            {probe.status === 'ok' && <><CheckIcon color={theme.pos} /> Connected</>}
            {probe.status === 'error' && <span>Retry</span>}
            {probe.status === 'idle' && <span>Test connection</span>}
          </button>
          {probe.message && (
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color:
                  probe.status === 'ok' ? theme.pos : probe.status === 'error' ? theme.neg : theme.fg2,
                maxWidth: 420,
                wordBreak: 'break-word',
              }}
            >
              {probe.message}
            </span>
          )}
        </div>
      </StepCard>

      {/* ─── STEP 2 · Goal ─────────────────────────────────────────── */}
      <StepCard theme={theme} n="02" title="State your goal" done={step2Done} disabled={!step1Done}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 6,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 700, color: theme.fg }}>
            What should I predict?
          </label>
          <span style={{ fontSize: 10, color: theme.fg3, fontFamily: 'var(--font-mono)' }}>
            plain English, one sentence
          </span>
        </div>
        <div
          style={{
            background: inputBg,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            disabled={!step1Done}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              color: theme.fg,
              fontSize: 16,
              fontFamily: 'var(--font-sans)',
              padding: 0,
              opacity: step1Done ? 1 : 0.5,
            }}
          />
        </div>

        {step1Done && onUseTemplate && (
          <div style={{ marginTop: 14 }}>
            <SimilarRunsPanel
              goal={goal}
              theme={theme}
              onUseTemplate={(run) => {
                setGoal(run.goal || goal);
                onUseTemplate(run);
              }}
            />
          </div>
        )}
      </StepCard>

      {/* ─── STEP 3 · Brahma writeup ───────────────────────────────── */}
      <StepCard theme={theme} n="03" title="Here's what I'll do" disabled={!step2Done}>
        <div
          style={{
            background: inputBg,
            borderRadius: 10,
            padding: '16px 18px',
            border: `1px solid ${theme.border}`,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: theme.fg2,
            lineHeight: 1.9,
            opacity: step2Done ? 1 : 0.4,
          }}
        >
          <div>
            <span style={{ color: theme.fg3 }}>Source : </span>
            <span style={{ color: theme.fg }}>{source.label}</span>
          </div>
          <div>
            <span style={{ color: theme.fg3 }}>Data &nbsp; : </span>
            <span style={{ color: theme.fg }}>{scenario.dataSize}</span>
          </div>
          <div>
            <span style={{ color: theme.fg3 }}>Goal &nbsp; : </span>
            <span style={{ color: theme.fg }}>{scenario.subtype}</span>
          </div>
          <div>
            <span style={{ color: theme.fg3 }}>Route : </span>
            <span style={{ color: theme.primary }}>{scenario.agent}</span>
          </div>
          <div>
            <span style={{ color: theme.fg3 }}>Output: </span>
            <span style={{ color: theme.fg }}>
              trained model · evaluation dashboard · SHAP · deployment package
            </span>
          </div>
        </div>

        <div
          style={{
            fontSize: 13,
            color: theme.fg2,
            lineHeight: 1.6,
            marginTop: 14,
            opacity: step2Done ? 1 : 0.4,
          }}
        >
          I will run {stages.length} stages — {stages.slice(0, -1).map((s) => s.name.toLowerCase()).join(', ')}, and {stages[stages.length - 1].name.toLowerCase()}. Training will compare {scenario.models.length} candidate {scenario.problemType === 'clustering' || scenario.problemType === 'anomaly' ? 'algorithms' : 'models'} with Optuna (50 trials each). Expect ~4 minutes on this dataset. You will see every step live.
        </div>

        {startError && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 10,
              background: isDark ? '#7F1D1D33' : '#FEE2E2',
              color: isDark ? '#FCA5A5' : '#991B1B',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              border: `1px solid ${isDark ? '#FCA5A555' : '#FCA5A5'}`,
            }}
          >
            {startError}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!step2Done || starting}
          style={{
            marginTop: 18,
            background: step2Done && !starting ? theme.primary : theme.border,
            color: '#fff',
            border: 'none',
            cursor: step2Done && !starting ? 'pointer' : 'not-allowed',
            borderRadius: 10,
            padding: '14px 20px',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            letterSpacing: 0.1,
            boxShadow: step2Done && !starting ? `0 6px 16px ${theme.primary}40` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            opacity: step2Done ? (starting ? 0.7 : 1) : 0.6,
          }}
        >
          {starting ? 'Starting…' : 'Start the pipeline'} <span style={{ fontSize: 18 }}>→</span>
        </button>
      </StepCard>
    </div>
  );
}
