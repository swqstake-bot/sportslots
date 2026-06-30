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
        background: 'linear-gradient(135deg, var(--app-bg-deep, #0A0A0F) 0%, #0d1220 50%, #080a12 100%)',
        fontFamily: "var(--font-body, 'Exo 2', sans-serif)",
      }}
    >
      <div
        className="w-full max-w-md p-10 rounded-2xl shadow-2xl"
        style={{
          background: 'var(--app-bg-card, rgba(15, 15, 25, 0.9))',
          border: '1px solid var(--app-border, rgba(0, 240, 255, 0.2))',
          boxShadow: '0 0 60px rgba(0, 240, 255, 0.08), 0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex flex-col items-center mb-10 gap-4">
          <img src={APP_LOGO_URL} alt="" className="h-12 w-auto" draggable={false} />
          <h1
            className="text-xl font-bold tracking-wide lowercase"
            style={{ fontFamily: "var(--font-heading, 'Orbitron', monospace)", color: 'var(--app-text, #e2e8f0)' }}
          >
            {APP_NAME}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--app-text-muted, #8890a8)' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg p-3.5 text-white placeholder-opacity-40 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/20 transition-all duration-200"
              style={{
                background: 'rgba(10, 10, 15, 0.8)',
                border: '1px solid rgba(0, 240, 255, 0.15)',
              }}
              placeholder="Username"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--app-text-muted, #8890a8)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg p-3.5 text-white placeholder-opacity-40 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/20 transition-all duration-200"
              style={{
                background: 'rgba(10, 10, 15, 0.8)',
                border: '1px solid rgba(0, 240, 255, 0.15)',
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
              className="w-4 h-4 rounded accent-cyan-400"
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
            className="w-full py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-200 transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, var(--app-accent, #00F0FF) 0%, #00c4d4 100%)',
              color: 'var(--app-bg-deep, #0A0A0F)',
              boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
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
