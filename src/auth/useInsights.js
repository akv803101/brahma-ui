import { useEffect, useState } from 'react';
import { pipelinesApi, ApiError } from './api.js';

/**
 * useInsights — POST /api/pipelines/{runId}/insights to generate (or
 * fetch cached) executive deck slides. Triggered only when `enabled`
 * is true so we don't burn Claude tokens until the user opens the tab.
 */
export default function useInsights(runId, enabled = true) {
  const [state, setState] = useState({ slides: null, loading: false, error: null });

  useEffect(() => {
    if (!runId || !enabled) {
      setState({ slides: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ slides: null, loading: true, error: null });
    pipelinesApi
      .insights(runId)
      .then((data) => {
        if (!cancelled) setState({ slides: data.slides || [], loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : 'Failed to generate insights.';
        setState({ slides: null, loading: false, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, enabled]);

  return state;
}
