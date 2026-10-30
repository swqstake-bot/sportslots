import { useRef, useState } from 'react';
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
  const importInput = useRef<HTMLInputElement>(null);

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
    <section className="copy-feed-block sports-profiles">
      <div className="sports-section-heading">
        <div><h3 className="copy-feed-kicker">Saved profiles</h3><p className="sports-section-hint">Reuse a configuration or keep a copy of your current settings.</p></div>
      </div>
      <div className="sports-profiles-body">
        <div className="sports-profile-actions">
          <button
            type="button"
            onClick={() => setSaveOpen(!saveOpen)}
            className="sports-secondary-btn"
            aria-expanded={saveOpen}
          >
            Save current
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={profiles.length === 0}
            className="sports-secondary-btn"
          >
            Export all
          </button>
          <button type="button" className="sports-secondary-btn" onClick={() => importInput.current?.click()}>
            Import
          </button>
          <input ref={importInput} type="file" accept=".json" onChange={handleImport} hidden aria-label="Import profiles JSON" />
        </div>
        
        {saveOpen && (
          <div className="sports-profile-save">
            <label className="copy-feed-field"><span>Profile name</span><input
              type="text"
              placeholder="Profile name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            /></label>
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="sports-secondary-btn"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setSaveOpen(false); setSaveName(''); }}
              className="sports-secondary-btn"
            >
              Cancel
            </button>
          </div>
        )}

        {importError && (
          <div className="sports-profile-error" role="alert">
            {importError}
          </div>
        )}

        {relevantProfiles.length === 0 ? (
          <p className="sports-section-hint">No profiles saved yet. Save the current configuration to reuse it later.</p>
        ) : (
          <div className="sports-profile-list">
            {relevantProfiles.map((profile) => (
              <div
                key={profile.id}
                className="sports-profile-row"
              >
                <button type="button" className="sports-profile-load" onClick={() => handleLoad(profile.id)} title={`Load profile · Created: ${new Date(profile.createdAt).toLocaleString()}`}>
                  <span>{profile.name}</span><span className="sports-profile-date">{new Date(profile.createdAt).toLocaleDateString()}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(profile.id, e)}
                  className="sports-secondary-btn sports-profile-delete"
                  aria-label={`Delete profile ${profile.name}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
