import React, { useEffect, useRef, useState } from 'react';
import { useAuth, workspacesApi, ApiError } from '../../auth';

/**
 * Title-bar avatar with a small dropdown:
 *   [Avatar circle]
 *      ┌──────────────────────┐
 *      │ Name                 │
 *      │ email@domain.com     │
 *      ├──────────────────────┤
 *      │ Workspace · Project  │
 *      ├──────────────────────┤
 *      │ Logout               │
 *      └──────────────────────┘
 *
 * Closes on outside-click and on Escape.
 */
export default function AvatarMenu({ theme }) {
  const { user, workspaces, currentWorkspace, currentProject, logout, selectWorkspace, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingErr, setCreatingErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const isDark = theme.bg === '#0B1020';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `2px solid ${open ? theme.primary : 'transparent'}`,
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.deep})`,
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {initial}
          </div>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 36,
            right: 0,
            zIndex: 1000,
            width: 280,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            boxShadow: '0 14px 30px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.04)',
            padding: '6px',
            fontFamily: 'var(--font-sans)',
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
          }}
        >
          {/* User block */}
          <div
            style={{
              padding: '10px 12px 12px',
              borderBottom: `1px solid ${theme.border}`,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: theme.fg,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: theme.fg2,
                fontFamily: 'var(--font-mono)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.email}
            </div>
          </div>

          {/* Workspace switcher */}
          <div
            style={{
              padding: '8px 12px 8px',
              borderBottom: `1px solid ${theme.border}`,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                fontWeight: 700,
                color: theme.fg3,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Workspaces
            </div>

            {(workspaces || []).map((ws) => {
              const active = currentWorkspace?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={async () => {
                    if (active || busy) return;
                    setBusy(true);
                    try {
                      await selectWorkspace(ws.id);
                      setOpen(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: active
                      ? isDark
                        ? '#1E3A8A33'
                        : `${theme.primary}11`
                      : 'transparent',
                    cursor: active ? 'default' : 'pointer',
                    textAlign: 'left',
                    marginBottom: 2,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = isDark ? '#1F2937' : '#F3F4F6';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.deep})`,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: active ? 700 : 600,
                        color: theme.fg,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ws.name}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10,
                        color: theme.fg3,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: 0.5,
                        marginTop: 1,
                      }}
                    >
                      {ws.role.toUpperCase()}
                      {ws.is_owner ? ' · OWNER' : ''}
                    </span>
                  </span>
                  {active && (
                    <span
                      style={{
                        color: theme.primary,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}

            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px dashed ${theme.border}`,
                  background: 'transparent',
                  color: theme.fg2,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  marginTop: 4,
                  letterSpacing: 0.3,
                }}
              >
                + Create new workspace
              </button>
            ) : (
              <CreateWorkspaceInline
                theme={theme}
                value={newName}
                setValue={setNewName}
                error={creatingErr}
                onCancel={() => {
                  setCreating(false);
                  setNewName('');
                  setCreatingErr(null);
                }}
                onSubmit={async () => {
                  if (!newName.trim() || busy) return;
                  setBusy(true);
                  setCreatingErr(null);
                  try {
                    const ws = await workspacesApi.create({ name: newName.trim() });
                    await selectWorkspace(ws.id);
                    setCreating(false);
                    setNewName('');
                    setOpen(false);
                  } catch (e) {
                    setCreatingErr(e instanceof ApiError ? e.message : 'Could not create workspace.');
                  } finally {
                    setBusy(false);
                  }
                }}
                busy={busy}
              />
            )}
          </div>

          {/* Project info — read-only for now */}
          {currentProject && (
            <div
              style={{
                padding: '8px 12px 10px',
                borderBottom: `1px solid ${theme.border}`,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1.4,
                  fontWeight: 700,
                  color: theme.fg3,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Active project
              </div>
              <div style={{ fontSize: 12, color: theme.fg }}>{currentProject.name}</div>
            </div>
          )}

          {/* Logout */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px 12px',
              borderRadius: 6,
              color: theme.fg,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? '#1F2937' : '#F3F4F6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CreateWorkspaceInline({ theme, value, setValue, error, onCancel, onSubmit, busy }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{
        marginTop: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.bg === '#0B1020' ? '#0B1020' : '#F9FAFB',
      }}
    >
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New workspace name"
        style={{
          padding: '7px 10px',
          fontSize: 12,
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          background: theme.card,
          color: theme.fg,
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      />
      {error && (
        <div style={{ fontSize: 10, color: theme.neg, fontFamily: 'var(--font-mono)' }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.fg2,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 6,
            fontFamily: 'var(--font-sans)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: 'none',
            background: theme.primary,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: busy || !value.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !value.trim() ? 0.6 : 1,
            borderRadius: 6,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {busy ? '…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
