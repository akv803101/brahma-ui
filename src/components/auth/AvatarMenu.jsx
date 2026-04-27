import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';

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
  const { user, currentWorkspace, currentProject, logout } = useAuth();
  const [open, setOpen] = useState(false);
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
            width: 240,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            boxShadow: '0 14px 30px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.04)',
            padding: '6px',
            fontFamily: 'var(--font-sans)',
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

          {/* Workspace + project info */}
          {currentWorkspace && (
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
                Workspace
              </div>
              <div style={{ fontSize: 12, color: theme.fg, fontWeight: 600 }}>
                {currentWorkspace.name}
                {currentWorkspace.is_owner && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      color: theme.fg3,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    OWNER
                  </span>
                )}
              </div>
              {currentProject && (
                <>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: 1.4,
                      fontWeight: 700,
                      color: theme.fg3,
                      textTransform: 'uppercase',
                      marginTop: 8,
                      marginBottom: 4,
                    }}
                  >
                    Project
                  </div>
                  <div style={{ fontSize: 12, color: theme.fg }}>
                    {currentProject.name}
                  </div>
                </>
              )}
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
