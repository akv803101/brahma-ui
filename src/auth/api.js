/**
 * Thin fetch wrappers for the auth + workspace endpoints.
 * `credentials: 'include'` is critical — without it the JWT cookie is dropped.
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof body.detail === 'string' ? body.detail : 'Request failed';
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const authApi = {
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login:  (body) => request('/auth/login',  { method: 'POST', body: JSON.stringify(body) }),
  logout: ()     => request('/auth/logout', { method: 'POST' }),
  me:     ()     => request('/me'),
  googleStartUrl: '/api/auth/google/start',
};

export const workspacesApi = {
  list:   ()     => request('/workspaces'),
  create: (body) => request('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  get:    (id)   => request(`/workspaces/${id}`),
};

export const projectsApi = {
  listByWorkspace: (wsId) => request(`/workspaces/${wsId}/projects`),
  create: (wsId, body) => request(`/workspaces/${wsId}/projects`, { method: 'POST', body: JSON.stringify(body) }),
  get: (id) => request(`/projects/${id}`),
};

export const runsApi = {
  recent: (params = {}) =>
    request(`/runs/recent${qs(params)}`),
  similar: (goal, limit = 5) =>
    request(`/runs/similar?goal=${encodeURIComponent(goal)}&limit=${limit}`),
  stats: (params = {}) =>
    request(`/runs/stats${qs(params)}`),
  get: (id) => request(`/runs/${id}`),
};

export const healthApi = {
  get: () => request('/health'),
};

function qs(params) {
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!filtered.length) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of filtered) sp.append(k, String(v));
  return `?${sp.toString()}`;
}
