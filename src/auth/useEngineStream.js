/**
 * useEngineStream — React hook that consumes the real-engine SSE feed
 * for a single pipeline run.
 *
 * Connects to /api/pipelines/{runId}/stream via EventSource. Cookies are
 * sent automatically since the backend is same-origin (Vite proxy in
 * dev, FastAPI-served in prod). Listeners are registered for every
 * typed event the backend emits; state is folded into a clean shape:
 *
 *   {
 *     status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error',
 *     model: string | null,           // narrative model (e.g. claude-haiku-4-5)
 *     narrative: string,              // accumulated text
 *     narrativeTokens: { in, out },
 *     stages: [
 *       { index, label, status: 'pending' | 'running' | 'done' | 'failed',
 *         elapsedS: number | null }
 *     ],
 *     leaderboard: Array<row> | null,
 *     outputs: { count, files: string[] } | null,
 *     elapsedS: number | null,        // total run time (set on complete)
 *     error: string | null,           // first fatal/error event
 *     events: Array<{ event, data, ts }>,  // raw audit log (capped)
 *   }
 *
 * Pass null/empty runId to mean "no run" — the hook tears down its
 * EventSource and returns idle state.
 */

import { useEffect, useReducer, useRef } from 'react';

const MAX_EVENT_LOG = 500;

const MAX_LOG_LINES_PER_STAGE = 200;

const initialState = {
  status: 'idle',
  model: null,
  narrative: '',
  narrativeTokens: { in: null, out: null },
  stages: [],
  // Per-stage log line buffers, keyed by stage index. Lines accumulate as
  // `stage_log` events stream in; capped to the last N to keep state lean.
  stageLogs: {},
  leaderboard: null,
  outputs: null,
  elapsedS: null,
  error: null,
  events: [],
};

function reducer(state, action) {
  if (action.type === '_reset') return initialState;

  if (action.type === '_connecting') return { ...state, status: 'connecting' };

  if (action.type === '_connection_error') {
    // EventSource reconnect attempts are silent at the browser level;
    // we surface this only if it persists beyond the first retry.
    return state;
  }

  const { event, data } = action;
  const events = [...state.events, { event, data, ts: Date.now() }].slice(-MAX_EVENT_LOG);

  switch (event) {
    case 'started': {
      const total = data.stage_count || 0;
      const stages = Array.from({ length: total }, (_, i) => ({
        index: i,
        label: '',
        status: 'pending',
        elapsedS: null,
      }));
      return {
        ...state,
        status: 'streaming',
        model: data.narrative_model || null,
        stages,
        events,
      };
    }
    case 'narrative_start':
      return { ...state, model: data.model || state.model, events };

    case 'narrative_chunk':
      return { ...state, narrative: state.narrative + (data.text || ''), events };

    case 'narrative_done':
      return {
        ...state,
        narrativeTokens: {
          in: data.input_tokens ?? null,
          out: data.output_tokens ?? null,
        },
        events,
      };

    case 'narrative_error':
      return { ...state, error: state.error || `narrative: ${data.error || 'unknown'}`, events };

    case 'stage_started': {
      const stages = state.stages.length ? [...state.stages] : [];
      // Ensure the slot exists (handles 'started' lacking stage_count edge)
      while (stages.length <= data.index) {
        stages.push({ index: stages.length, label: '', status: 'pending', elapsedS: null, startedAt: null });
      }
      stages[data.index] = {
        ...stages[data.index],
        index: data.index,
        label: data.label || stages[data.index].label,
        status: 'running',
        // Anchor for the client-side live tick (G2). Server's authoritative
        // elapsed_s lands later via stage_done.
        startedAt: Date.now(),
      };
      return { ...state, stages, events };
    }

    case 'stage_done': {
      const stages = [...state.stages];
      while (stages.length <= data.index) {
        stages.push({ index: stages.length, label: '', status: 'pending', elapsedS: null, startedAt: null });
      }
      stages[data.index] = {
        ...stages[data.index],
        index: data.index,
        label: data.label || stages[data.index].label,
        status: data.ok ? 'done' : 'failed',
        elapsedS: data.elapsed_s ?? null,
        // Clear the live anchor — UI now uses authoritative elapsedS
        startedAt: null,
      };
      return { ...state, stages, events };
    }

    case 'stage_log': {
      // Append a log line to the per-stage buffer (keep last N).
      const idx = data.index;
      if (idx == null || data.text == null) return { ...state, events };
      const prev = state.stageLogs[idx] || [];
      const next = [...prev, data.text].slice(-MAX_LOG_LINES_PER_STAGE);
      return {
        ...state,
        stageLogs: { ...state.stageLogs, [idx]: next },
        events,
      };
    }

    case 'stage_failed': {
      // Already marked failed in stage_done; just record the log path
      return { ...state, events };
    }

    case 'outputs_copied':
      return {
        ...state,
        outputs: { count: data.count || 0, files: data.files || [] },
        events,
      };

    case 'leaderboard':
      return { ...state, leaderboard: data.rows || [], events };

    case 'complete':
      return {
        ...state,
        status: 'complete',
        elapsedS: data.elapsed_s ?? state.elapsedS,
        events,
      };

    case 'fatal':
      return { ...state, status: 'error', error: data.error || 'fatal error', events };

    default:
      return { ...state, events };
  }
}

export default function useEngineStream(runId) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef(null);

  useEffect(() => {
    if (!runId) {
      dispatch({ type: '_reset' });
      return undefined;
    }

    dispatch({ type: '_reset' });
    dispatch({ type: '_connecting' });

    const url = `/api/pipelines/${encodeURIComponent(runId)}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    const NAMES = [
      'started',
      'narrative_start',
      'narrative_chunk',
      'narrative_done',
      'narrative_error',
      'stage_started',
      'stage_done',
      'stage_failed',
      'stage_log',
      'outputs_copied',
      'leaderboard',
      'complete',
      'fatal',
      // mock-mode events still flow through; render on best-effort
      'stage',
      'log',
      'done',
    ];

    const handlers = {};
    for (const name of NAMES) {
      const h = (e) => {
        let data = null;
        try {
          data = e.data ? JSON.parse(e.data) : null;
        } catch {
          data = e.data;
        }
        dispatch({ type: 'event', event: name, data: data || {} });
      };
      handlers[name] = h;
      es.addEventListener(name, h);
    }

    es.onerror = () => {
      dispatch({ type: '_connection_error' });
      // EventSource auto-reconnects; we close it once 'complete' lands.
    };

    return () => {
      for (const name of NAMES) {
        try {
          es.removeEventListener(name, handlers[name]);
        } catch {
          /* noop */
        }
      }
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  // Auto-close once the run completes — no point keeping the connection open
  useEffect(() => {
    if ((state.status === 'complete' || state.status === 'error') && esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, [state.status]);

  return state;
}
