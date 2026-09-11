import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProfilesStore } from '../../store/profilesStore';
import { useAutoBetStore } from '../../store/autoBetStore';
import { useCopyBetStore } from '../../store/copyBetStore';
import { useCasinoStore } from '../Casino/store/casinoStore';

interface ProfilesPanelProps {
  mode: 'autobet' | 'copybet' | 'combined' | 'casino';
  onApply?: () => void;
}

export function ProfilesPanel({ mode, onApply }: ProfilesPanelProps) {
  const { profiles, saveProfile, loadProfile, deleteProfile, exportProfiles, importProfiles } = useProfilesStore();
  const autoBetSettings = useAutoBetStore((s) => s.settings);
  const updateAutoBetSettings = useAutoBetStore((s) => s.updateSettings);
  const copyBetSettings = useCopyBetStore((s) => s.settings);
  const updateCopyBetSettings = useCopyBetStore((s) => s.updateSettings);
  
  // Casino prefs with useShallow to prevent unnecessary re-renders
  const casinoPrefs = useCasinoStore(useShallow((s) => ({
    useSharedCurrency: s.useSharedCurrency,
    sharedSourceCurrency: s.sharedSourceCurrency,
    sharedTargetCurrency: s.sharedTargetCurrency,
    sharedCryptoOnly: s.sharedCryptoOnly,
  })));
  const updateCasinoPrefs = useCasinoStore(useShallow((s) => ({
    setUseSharedCurrency: s.setUseSharedCurrency,
    setSharedSourceCurrency: s.setSharedSourceCurrency,
    setSharedTargetCurrency: s.setSharedTargetCurrency,
    setSharedCryptoOnly: s.setSharedCryptoOnly,
  })));
  
  const [saveName, setSaveName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [importError, setImportError] = useState('');

  const handleSave = () => {
    if (!saveName.trim()) return;
    const data: any = {};
    if (mode === 'autobet' || mode === 'combined') {
      data.autoBet = autoBetSettings;
    }
    if (mode === 'copybet' || mode === 'combined') {
      data.copyBet = copyBetSettings;
    }
    if (mode === 'casino' || mode === 'combined') {
      data.casino = casinoPrefs;
    }
    saveProfile(saveName.trim(), data);
    setSaveName('');
    setSaveOpen(false);
  };

  const handleLoad = (id: string) => {
    const profile = loadProfile(id);
    if (!profile) return;
    if (profile.autoBet && (mode === 'autobet' || mode === 'combined')) {
      updateAutoBetSettings(profile.autoBet);
    }
    if (profile.copyBet && (mode === 'copybet' || mode === 'combined')) {
      updateCopyBetSettings(profile.copyBet);
    }
    if (profile.casino && (mode === 'casino' || mode === 'combined')) {
      if (profile.casino.useSharedCurrency !== undefined) updateCasinoPrefs.setUseSharedCurrency(profile.casino.useSharedCurrency);
      if (profile.casino.sharedSourceCurrency) updateCasinoPrefs.setSharedSourceCurrency(profile.casino.sharedSourceCurrency);
      if (profile.casino.sharedTargetCurrency) updateCasinoPrefs.setSharedTargetCurrency(profile.casino.sharedTargetCurrency);
      if (profile.casino.sharedCryptoOnly !== undefined) updateCasinoPrefs.setSharedCryptoOnly(profile.casino.sharedCryptoOnly);
    }
    if (onApply) onApply();
  };

  const handleExport = () => {
    const json = exportProfiles();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sportslots-profiles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const json = evt.target?.result as string;
      const result = importProfiles(json);
      if (result.success) {
        setImportError('');
        alert(`Successfully imported ${result.imported} profile(s)`);
      } else {
        setImportError(result.error || 'Unknown error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this profile?')) {
      deleteProfile(id);
    }
  };

  const relevantProfiles = profiles.filter((p) => {
    if (mode === 'autobet') return p.autoBet;
    if (mode === 'copybet') return p.copyBet;
    if (mode === 'casino') return p.casino;
    return true;
  });

  return (
    <div className="copy-feed-block">
      <h3 className="copy-feed-kicker">Profiles</h3>
      <div className="copy-feed-fields">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            onClick={() => setSaveOpen(!saveOpen)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', background: '#2a2a2a', border: '1px solid #444', color: '#fff', cursor: 'pointer' }}
          >
            Save Current
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={profiles.length === 0}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', background: '#2a2a2a', border: '1px solid #444', color: '#fff', cursor: 'pointer', opacity: profiles.length === 0 ? 0.5 : 1 }}
          >
            Export All
          </button>
          <label
            style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', background: '#2a2a2a', border: '1px solid #444', color: '#fff', cursor: 'pointer', textAlign: 'center' }}
          >
            Import
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
        
        {saveOpen && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              placeholder="Profile name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', background: '#1a1a1a', border: '1px solid #444', color: '#fff' }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              style={{ padding: '8px 16px', borderRadius: '4px', background: '#2a2a2a', border: '1px solid #444', color: '#fff', cursor: 'pointer', opacity: !saveName.trim() ? 0.5 : 1 }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setSaveOpen(false); setSaveName(''); }}
              style={{ padding: '8px 16px', borderRadius: '4px', background: '#2a2a2a', border: '1px solid #444', color: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {importError && (
          <div style={{ padding: '8px', marginBottom: '8px', background: '#ff000020', border: '1px solid #ff0000', borderRadius: '4px', color: '#ff6b6b', fontSize: '13px' }}>
            {importError}
          </div>
        )}

        {relevantProfiles.length === 0 ? (
          <p style={{ color: '#888', fontSize: '13px', margin: '8px 0' }}>No profiles saved yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {relevantProfiles.map((profile) => (
              <div
                key={profile.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => handleLoad(profile.id)}
                title={`Created: ${new Date(profile.createdAt).toLocaleString()}`}
              >
                <span style={{ color: '#fff', fontSize: '14px' }}>{profile.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleDelete(profile.id, e)}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid #ff4444',
                    borderRadius: '3px',
                    color: '#ff4444',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
