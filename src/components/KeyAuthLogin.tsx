import React, { useState, useEffect } from 'react';
import { keyAuthLogin, keyAuthInit } from '../api/keyauth';

interface KeyAuthLoginProps {
  onSuccess: () => void;
}

export function KeyAuthLogin({ onSuccess }: KeyAuthLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hwid, setHwid] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        // Initial KeyAuth check
        await keyAuthInit();
        
        // Fetch HWID from Electron if available
        if (window.electronAPI?.getKeyAuthHwid) {
            const h = await window.electronAPI.getKeyAuthHwid();
            setHwid(h);
        }
      } catch (err: any) {
        setError(err.message || 'Initialisierungsfehler');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Bitte Benutzername und Passwort eingeben.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await keyAuthLogin(username, password, hwid);
      // Save credentials if needed? Maybe later.
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f212e] text-white font-sans">
      <div className="w-full max-w-md p-8 bg-[#1a2c38] rounded-xl shadow-2xl border border-[#2f4553]">
        <div className="flex justify-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-wider uppercase">StakeSports Login</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#b1bad3] uppercase tracking-wide">Benutzername</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md p-3 text-white focus:outline-none focus:border-[#00e701] transition-colors"
              placeholder="KeyAuth Username"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#b1bad3] uppercase tracking-wide">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md p-3 text-white focus:outline-none focus:border-[#00e701] transition-colors"
              placeholder="Passwort"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-md font-bold text-[#0f212e] bg-[#00e701] hover:bg-[#00c201] transition-all transform active:scale-[0.98] shadow-lg shadow-green-900/20 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[#0f212e] border-t-transparent rounded-full animate-spin"></span>
                Wird geladen...
              </span>
            ) : (
              'LOGIN'
            )}
          </button>
          
          <div className="text-center text-xs text-[#b1bad3] mt-2">
            Protected by KeyAuth &bull; HWID: {hwid ? 'Detected' : 'Web Fallback'}
          </div>
        </form>
      </div>
    </div>
  );
}
