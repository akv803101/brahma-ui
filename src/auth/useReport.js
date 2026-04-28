import { useEffect, useState } from 'react';
import { pipelinesApi, ApiError } from './api.js';

/**
 * useReport — fetch /api/pipelines/{runId}/report once.
 *
 * Returns { report, loading, error }. Pass null/empty runId to opt out.
 * The report payload includes: narrative, leaderboard, files, charts.
 */
export default function useReport(runId) {
  const [state, setState] = useState({ report: null, loading: false, error: null });

  useEffect(() => {
    if (!runId) {
      setState({ report: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ report: null, loading: true, error: null });
    pipelinesApi
      .getReport(runId)
      .then((report) => {
        if (!cancelled) setState({ report, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : 'Failed to load report.';
        setState({ report: null, loading: false, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return state;
}
