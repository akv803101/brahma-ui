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
    label: 'Local CSV file (upload from your laptop)',
    hint: 'csv · xlsx · parquet · json · tsv (50 MB max)',
    backend: 'file',
    liveProbe: true,
    upload: true,         // J1: render the upload widget instead of text fields
    fields: [
      // Filled in by handleFileUpload after the user picks a file
      { key: 'filename',  label: 'Filename',  def: '' },
      { key: 'temp_path', label: 'Path',      def: '' },
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
      { key: 'sslmode',        label: 'SSL mode (Neon → require)', def: 'require' },
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
    label: 'Snowflake',
    hint: 'account · warehouse · table',
    backend: 'snowflake',
    liveProbe: true,
    fields: [
      { key: 'account',        label: 'Account (e.g. acme-prod.us-east-1)', def: '' },
      { key: 'user',           label: 'User',                                 def: '' },
      { key: 'password',       label: 'Password',                             def: '', secret: true },
      { key: 'warehouse',      label: 'Warehouse',                            def: 'COMPUTE_WH' },
      { key: 'database',       label: 'Database',                             def: '' },
      { key: 'schema',         label: 'Schema',                               def: 'PUBLIC' },
      { key: 'role',           label: 'Role (optional)',                      def: '' },
      { key: 'table_or_query', label: 'Table or SELECT',                      def: 'CUSTOMERS' },
    ],
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    hint: 'project · dataset · table',
    backend: 'bigquery',
    liveProbe: true,
    fields: [
      { key: 'project',          label: 'GCP project ID',                          def: '' },
      { key: 'dataset',          label: 'Dataset',                                 def: '' },
      { key: 'table_or_query',   label: 'Table or SELECT',                         def: '' },
      { key: 'credentials_json', label: 'Service account JSON (paste full file)',  def: '', secret: true, multiline: true },
    ],
  },
  {
    id: 's3',
    label: 'Amazon S3',
    hint: 'bucket · key · format',
    backend: 's3',
    liveProbe: true,
    fields: [
      { key: 'bucket',      label: 'Bucket',                       def: '' },
      { key: 'key',         label: 'Key (path inside bucket)',     def: '' },
      { key: 'region',      label: 'Region',                       def: 'us-east-1' },
      { key: 'file_format', label: 'Format (csv | parquet | json)', def: 'parquet' },
      { key: 'access_key',  label: 'Access key ID',                def: '' },
      { key: 'secret_key',  label: 'Secret access key',            def: '', secret: true },
    ],
  },
  {
    id: 'gsheet',
    label: 'Google Sheets',
    hint: 'sheet URL · tab',
    backend: 'google_sheets',
    liveProbe: true,
    fields: [
      { key: 'url',              label: 'Sheet URL',                              def: '' },
      { key: 'tab',              label: 'Tab name',                               def: 'Sheet1' },
      { key: 'credentials_json', label: 'Service account JSON (paste full file)', def: '', secret: true, multiline: true },
    ],
  },
  {
    id: 'api',
    label: 'HTTP / REST',
    hint: 'json endpoint',
    backend: 'rest_api',
    liveProbe: true,
    fields: [
      { key: 'url',       label: 'Endpoint URL',                                  def: 'https://api.example.com/v2/customers' },
      { key: 'method',    label: 'Method (GET or POST)',                          def: 'GET' },
      { key: 'api_key',   label: 'API key (optional · sent as Bearer token)',     def: '', secret: true },
      { key: 'json_path', label: 'JSON path to records (optional · e.g. data.items)', def: '' },
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

/**
 * J1 — drag-and-drop or click file picker for the local-CSV source.
 * Uses pipelinesApi.uploadFile under the hood (handler in parent).
 *
 * States are driven by the parent's `probe`:
 *   probe.status === 'testing'  → "uploading… 🔄" with the filename
 *   probe.status === 'ok'       → "✓ {filename} · 638 KB · 22 cols"
 *   probe.status === 'error'    → red "✕ {message}"
 *   else                        → drop target with "Click to choose a file" CTA
 */
function FileUploadWidget({ theme, inputBg, probe, currentFile, onFile }) {
  const inputRef = React.useRef(null);
  const [dragOver, setDragOver] = React.useState(false);
  const isDark = theme.bg === '#0B1020';

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  };

  const onChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const status = probe.status;
  const tone =
    status === 'ok'
      ? theme.pos
      : status === 'error'
      ? theme.neg
      : status === 'testing'
      ? theme.primary
      : theme.fg2;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          background: inputBg,
          border: `2px dashed ${dragOver ? theme.primary : status === 'error' ? theme.neg : theme.border}`,
          borderRadius: 12,
          padding: '20px 18px',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,.parquet,.json"
          onChange={onChange}
          style={{ display: 'none' }}
        />
        <div
          style={{
            fontSize: 28,
            color: tone,
            marginBottom: 6,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {status === 'ok' ? '✓' : status === 'error' ? '✕' : status === 'testing' ? '…' : '↑'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.fg, marginBottom: 4 }}>
          {status === 'ok' && currentFile
            ? `Uploaded: ${currentFile}`
            : status === 'testing'
            ? 'Uploading…'
            : status === 'error'
            ? 'Upload failed — click to try again'
            : 'Click to choose a file or drop one here'}
        </div>
        <div style={{ fontSize: 11, color: theme.fg3, fontFamily: 'var(--font-mono)' }}>
          csv · tsv · xlsx · xls · parquet · json   ·   max 50 MB
        </div>
      </div>

      {probe.message && status !== 'idle' && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            fontFamily: 'var(--font-mono)',
            color: tone,
            wordBreak: 'break-word',
          }}
        >
          {probe.message}
        </div>
      )}

      {probe.sample?.columns?.length > 0 && status === 'ok' && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: isDark ? '#0B1020' : '#FFFFFF',
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: theme.fg2,
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: theme.fg3, marginBottom: 4, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
            Detected columns
          </div>
          {probe.sample.columns.slice(0, 12).join(' · ')}
          {probe.sample.columns.length > 12 && ` … (+${probe.sample.columns.length - 12} more)`}
        </div>
      )}
    </div>
  );
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
    setProbe({ status: 'idle', message: '', sample: null, warning: null, severity: null });
  }, [sourceId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [goal, setGoal] = useState(scenario.goal);
  // Probe state: { status: 'idle' | 'testing' | 'ok' | 'error', message, sample, warning, severity }
  const [probe, setProbe] = useState({ status: 'idle', message: '', sample: null, warning: null, severity: null });

  useEffect(() => {
    setGoal(scenario.goal);
    setProbe({ status: 'idle', message: '', sample: null, warning: null, severity: null });
  }, [scenario.id]);

  const connected = probe.status === 'ok';
  const step1Done = connected;
  const step2Done = connected && goal.trim().length > 10;

  const handleTestConnection = async () => {
    setProbe({ status: 'testing', message: '', sample: null, warning: null, severity: null });
    const sourceConfig = buildSourceConfig(source, fieldVals);
    try {
      const res = await pipelinesApi.testConnection({ sourceConfig });
      setProbe({
        status: res.ok ? 'ok' : 'error',
        message: res.message || (res.ok ? 'Connected.' : 'Connection failed.'),
        sample: res.sample || null,
        warning: res.warning || null,
        severity: res.severity || null,
      });
    } catch (e) {
      setProbe({
        status: 'error',
        message: e instanceof ApiError ? e.message : 'Network error.',
        sample: null,
        warning: null,
        severity: null,
      });
    }
  };

  const handleStart = () => {
    if (!step2Done) return;
    const sourceConfig = buildSourceConfig(source, fieldVals);
    onStart?.({ sourceConfig, goal });
  };

  // J1: file upload from the user's laptop. On success, populates the
  // hidden filename + temp_path field values AND auto-marks the probe
  // as ok so the user doesn't need a second Test connection click.
  const handleFileUpload = async (file) => {
    if (!file) return;
    setProbe({
      status: 'testing',
      message: `uploading ${file.name}…`,
      sample: null,
      warning: null,
      severity: null,
    });
    try {
      const res = await pipelinesApi.uploadFile(file);
      // Stash the server-side path into fieldVals so buildSourceConfig
      // picks it up when the user clicks Start the pipeline.
      setFieldVals({ filename: res.filename, temp_path: res.temp_path });
      const colCount = res.column_count;
      const rowCount = res.row_count;
      const summary =
        `${res.filename} · ${res.size_mb.toFixed(2)} MB` +
        (rowCount != null ? ` · ${rowCount.toLocaleString()} rows` : '') +
        (colCount != null ? ` · ${colCount} cols` : '');
      setProbe({
        status: 'ok',
        message: summary,
        sample: { columns: res.columns, row_count: rowCount },
        warning: null,
        severity: null,
      });
    } catch (e) {
      setProbe({
        status: 'error',
        message: e instanceof ApiError ? e.message : 'Upload failed.',
        sample: null,
        warning: null,
        severity: null,
      });
    }
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
        {source.upload ? (
          <FileUploadWidget
            theme={theme}
            inputBg={inputBg}
            probe={probe}
            currentFile={fieldVals.filename || null}
            onFile={handleFileUpload}
          />
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {source.fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 11, fontWeight: 600, color: theme.fg2, marginBottom: 4 }}>
                {f.label}
              </div>
              {f.multiline ? (
                <textarea
                  value={fieldVals[f.key] ?? ''}
                  onChange={(e) => {
                    setFieldVals((v) => ({ ...v, [f.key]: e.target.value }));
                    setProbe({ status: 'idle', message: '', sample: null, warning: null, severity: null });
                  }}
                  rows={6}
                  spellCheck={false}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    outline: 'none',
                    color: theme.fg,
                    fontSize: 11.5,
                    lineHeight: 1.4,
                    fontFamily: 'var(--font-mono)',
                    resize: 'vertical',
                  }}
                />
              ) : (
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={fieldVals[f.key] ?? ''}
                  onChange={(e) => {
                    setFieldVals((v) => ({ ...v, [f.key]: e.target.value }));
                    setProbe({ status: 'idle', message: '', sample: null, warning: null, severity: null });
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
              )}
            </div>
          ))}
        </div>
        )}

        {/* Test connection button — hidden for the upload source since
            handleFileUpload already validates + sniffs during the upload itself. */}
        {!source.upload && (
        <>
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
        {probe.warning && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: probe.severity === 'danger'
                ? (isDark ? '#7F1D1D33' : '#FEE2E2')
                : (isDark ? '#78350F33' : '#FEF3C7'),
              border: `1px solid ${probe.severity === 'danger'
                ? (isDark ? '#FCA5A555' : '#FCA5A5')
                : (isDark ? '#FBBF2455' : '#FCD34D')}`,
              color: probe.severity === 'danger'
                ? (isDark ? '#FCA5A5' : '#991B1B')
                : (isDark ? '#FCD34D' : '#92400E'),
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55,
            }}
          >
            {probe.warning}
          </div>
        )}
        </>
        )}
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
