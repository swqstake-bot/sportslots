import React, { useState, useEffect } from 'react';
import { keyAuthLogin, keyAuthInit } from '../api/keyauth';
import { APP_LOGO_URL, APP_NAME } from '../constants/branding';

const STORAGE_KEY = 'keyauth_save_credentials';
const SAVED_USER_KEY = 'keyauth_saved_username';
const SAVED_PASS_KEY = 'keyauth_saved_password';

interface KeyAuthLoginProps {
  onSuccess: () => void;
}

export function KeyAuthLogin({ onSuccess }: KeyAuthLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hwid, setHwid] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        await keyAuthInit();
        if (window.electronAPI?.getKeyAuthHwid) {
          const h = await window.electronAPI.getKeyAuthHwid();
          setHwid(h);
        }
        const shouldRemember = localStorage.getItem(STORAGE_KEY) === '1';
        setRememberMe(shouldRemember);
        if (shouldRemember) {
          const savedUser = localStorage.getItem(SAVED_USER_KEY);
          const savedPass = localStorage.getItem(SAVED_PASS_KEY);
          if (savedUser) setUsername(savedUser);
          if (savedPass) setPassword(savedPass);
        }
      } catch (err: any) {
        setError(err.message || 'Initialization failed');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await keyAuthLogin(username, password, hwid);
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY, '1');
        localStorage.setItem(SAVED_USER_KEY, username);
        localStorage.setItem(SAVED_PASS_KEY, password);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SAVED_USER_KEY);
        localStorage.removeItem(SAVED_PASS_KEY);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-1 items-center justify-center min-h-0 text-white"
      style={{
        background: 'var(--app-bg-deep, #0c0d10)',
        fontFamily: "var(--font-body, 'Inter', ui-sans-serif, sans-serif)",
      }}
    >
      <div
        className="w-full max-w-md p-10"
        style={{
          background: 'var(--app-bg-card, #13151a)',
          border: '1px solid var(--app-border, #2a2e38)',
        }}
      >
        <div className="flex flex-col items-center mb-10 gap-4">
          <img src={APP_LOGO_URL} alt="" className="h-12 w-auto" draggable={false} />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-heading, 'Inter', ui-sans-serif, sans-serif)", color: 'var(--app-text, #eceef2)' }}
          >
            {APP_NAME}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--app-text-muted, #8b919c)' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg p-3.5 text-white placeholder-opacity-40 focus:outline-none transition-all duration-200"
              style={{
                background: 'var(--app-bg-deep, #0c0d10)',
                border: '1px solid var(--app-border, #2a2e38)',
              }}
              placeholder="Username"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--app-text-muted, #8b919c)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg p-3.5 text-white placeholder-opacity-40 focus:outline-none transition-all duration-200"
              style={{
                background: 'var(--app-bg-deep, #0c0d10)',
                border: '1px solid var(--app-border, #2a2e38)',
              }}
              placeholder="Password"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded"
              disabled={loading}
            />
            <span className="text-sm" style={{ color: 'var(--app-text-muted, #8890a8)' }}>
              Remember credentials
            </span>
          </label>

          {error && (
            <div
              className="p-3 rounded-lg text-sm text-center"
              style={{ background: 'rgba(255, 51, 102, 0.1)', border: '1px solid rgba(255, 51, 102, 0.3)', color: 'var(--app-error, #ff3366)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-lg font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110"
            style={{
              background: 'var(--app-accent, #5eead4)',
              color: 'var(--app-bg-deep, #0c0d10)',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading…
              </span>
            ) : (
              'Sign in'
            )}
          </button>

          <p className="text-center text-[10px] mt-1" style={{ color: 'var(--app-text-dim, #55657e)' }}>
            HWID: {hwid ? 'Detected' : 'Web Fallback'}
          </p>
        </form>
      </div>
    </div>
  );
}
