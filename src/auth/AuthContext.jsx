import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, authApi, healthApi, workspacesApi, projectsApi } from './api.js';

/**
 * Centralized auth + workspace state.
 *
 * Status flow:
 *   loading           — initial /api/me request in flight
 *   anonymous         — no session
 *   needs_workspace   — signed in but no workspaces yet
 *   needs_project     — has a workspace, no projects yet
 *   ready             — has a workspace + project; main app renders
 *
 * Persists the user's chosen workspace + project ids in localStorage so
 * page refreshes don't bounce them through the picker again.
 */

const AuthContext = createContext(null);

const LS_WS = 'brahma_current_workspace_id';
const LS_PJ = 'brahma_current_project_id';

const initialState = {
  status: 'loading',
  user: null,
  workspaces: [],
  currentWorkspace: null,   // { id, name, role, is_owner, projects: [...] }
  currentProject: null,     // one of currentWorkspace.projects
  googleEnabled: true,
  error: null,
};

export function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);

  /** Pull /api/me + chosen workspace details, derive overall status. */
  const refresh = useCallback(async () => {
    try {
      const [me, health] = await Promise.all([
        authApi.me().catch((e) => {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }),
        healthApi.get().catch(() => ({ google_oauth: false })),
      ]);

      if (!me) {
        setState({
          ...initialState,
          status: 'anonymous',
          googleEnabled: !!health.google_oauth,
        });
        return;
      }

      if (me.workspaces.length === 0) {
        setState({
          ...initialState,
          status: 'needs_workspace',
          user: me.user,
          workspaces: [],
          googleEnabled: !!health.google_oauth,
        });
        return;
      }

      // Pick a workspace — prefer the one stored in localStorage
      const savedWsId = parseInt(localStorage.getItem(LS_WS) || '0', 10);
      const wsLite =
        me.workspaces.find((w) => w.id === savedWsId) || me.workspaces[0];

      const wsDetail = await workspacesApi.get(wsLite.id).catch(() => null);
      if (!wsDetail) {
        // Stored workspace was deleted server-side — fall back to first
        const first = me.workspaces[0];
        const fallback = await workspacesApi.get(first.id);
        localStorage.setItem(LS_WS, String(first.id));
        return finishWith(me.user, me.workspaces, fallback, health);
      }
      localStorage.setItem(LS_WS, String(wsDetail.id));
      finishWith(me.user, me.workspaces, wsDetail, health);

      function finishWith(user, workspaces, wsDetail, health) {
        if (wsDetail.projects.length === 0) {
          setState({
            status: 'needs_project',
            user,
            workspaces,
            currentWorkspace: wsDetail,
            currentProject: null,
            googleEnabled: !!health.google_oauth,
            error: null,
          });
          return;
        }
        const savedPjId = parseInt(localStorage.getItem(LS_PJ) || '0', 10);
        const project =
          wsDetail.projects.find((p) => p.id === savedPjId) ||
          wsDetail.projects[0];
        localStorage.setItem(LS_PJ, String(project.id));
        setState({
          status: 'ready',
          user,
          workspaces,
          currentWorkspace: wsDetail,
          currentProject: project,
          googleEnabled: !!health.google_oauth,
          error: null,
        });
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'anonymous',
        error: err.message || 'Failed to load session',
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Actions ─────────────────────────────────────────────────────────
  const actions = useMemo(
    () => ({
      async login(email, password) {
        await authApi.login({ email, password });
        await refresh();
      },
      async signup(email, password, name) {
        await authApi.signup({ email, password, name });
        await refresh();
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
          // ignore — we'll clear local state regardless
        }
        localStorage.removeItem(LS_WS);
        localStorage.removeItem(LS_PJ);
        setState({ ...initialState, status: 'anonymous', googleEnabled: state.googleEnabled });
      },
      googleSignIn() {
        // Full-page redirect to /api/auth/google/start
        window.location.href = authApi.googleStartUrl;
      },
      async createWorkspace(name) {
        const ws = await workspacesApi.create({ name });
        localStorage.setItem(LS_WS, String(ws.id));
        await refresh();
        return ws;
      },
      async createProject(workspaceId, body) {
        const pj = await projectsApi.create(workspaceId, body);
        localStorage.setItem(LS_PJ, String(pj.id));
        await refresh();
        return pj;
      },
      selectWorkspace(workspaceId) {
        localStorage.setItem(LS_WS, String(workspaceId));
        return refresh();
      },
      selectProject(projectId) {
        localStorage.setItem(LS_PJ, String(projectId));
        setState((s) =>
          s.currentWorkspace
            ? {
                ...s,
                currentProject:
                  s.currentWorkspace.projects.find((p) => p.id === projectId) ||
                  s.currentProject,
              }
            : s
        );
      },
      refresh,
    }),
    [refresh, state.googleEnabled]
  );

  return (
    <AuthContext.Provider value={{ ...state, ...actions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
