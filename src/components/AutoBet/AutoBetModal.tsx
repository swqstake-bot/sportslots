import { useState } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { TournamentEventPickFields } from './TournamentEventPickFields';
import { hasTournamentScope } from '../../utils/tournamentScope';

interface AutoBetModalProps {
  onClose: () => void;
}

const STRATEGIES: AutoBetStrategy[] = [
  'Smart', 'Conservative', 'Aggressive', 'Balanced', 'Favorites', 'Underdogs', 'ValueHunter'
];

export function AutoBetModal({ onClose }: AutoBetModalProps) {
  const { settings, logs, isRunning, updateSettings, start, stop, clearLogs } = useAutoBetStore();
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');

  const handleStartStop = () => {
    if (isRunning) {
      stop();
    } else {
      start();
      onClose(); // Optional: close on start
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
          <h2 className="text-xl font-bold text-green-500">AutoBet Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button 
            className={`flex-1 py-3 font-bold ${activeTab === 'settings' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
          <button 
            className={`flex-1 py-3 font-bold ${activeTab === 'logs' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('logs')}
          >
            Logs ({logs.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'settings' ? (
            <div className="space-y-6">
              {/* Strategy */}
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Strategy</label>
                <select 
                  value={settings.strategy}
                  onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                >
                  {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Odds Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Min Odds</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={settings.minOdds}
                    onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Max Odds</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={settings.maxOdds}
                    onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
              </div>

              {/* Legs Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Min Legs</label>
                  <input 
                    type="number" 
                    value={settings.minLegs}
                    onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Max Legs</label>
                  <input 
                    type="number" 
                    value={settings.maxLegs}
                    onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
              </div>

              {/* Amount & Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Amount</label>
                  <input 
                    type="number" 
                    step="0.00000001"
                    value={settings.amount}
                    onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Currency</label>
                  <input 
                    type="text" 
                    value={settings.currency}
                    onChange={(e) => updateSettings({ currency: e.target.value.toLowerCase() })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none uppercase"
                  />
                </div>
              </div>

              {/* Limits & Filters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Number of Bets</label>
                  <input 
                    type="number" 
                    value={settings.numberOfBets}
                    onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Event Filter (e.g. UFC)</label>
                  <input 
                    type="text" 
                    value={settings.eventFilter}
                    onChange={(e) => updateSettings({ eventFilter: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                    placeholder="All events"
                    disabled={hasTournamentScope(settings)}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="block text-sm font-bold text-gray-400 mb-1">Turnier / Event</label>
                  <TournamentEventPickFields
                    settings={settings}
                    updateSettings={updateSettings}
                    selectClass="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none appearance-none cursor-pointer"
                    inputClass="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs font-mono text-white focus:border-green-500 outline-none"
                    inputSelectStyle={{ background: '#111827', border: '1px solid #374151', color: '#fff' }}
                    labelClass="block text-sm font-bold text-gray-400 mb-2"
                    labelStyle={{}}
                    variant="modal"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={settings.fillUpEventMaxLegs || false}
                      onChange={(e) => updateSettings({ fillUpEventMaxLegs: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-green-500 rounded focus:ring-0 bg-gray-900 border-gray-700"
                      disabled={!hasTournamentScope(settings)}
                    />
                    <span className="text-gray-300">Fill legs pro Event (alle Fights im Turnier, max. Legs beachten)</span>
                  </label>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={settings.preferLiveGames}
                    onChange={(e) => updateSettings({ preferLiveGames: e.target.checked })}
                    className="form-checkbox h-5 w-5 text-green-500 rounded focus:ring-0 bg-gray-900 border-gray-700"
                  />
                  <span className="text-gray-300">Prefer Live Games</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={settings.preferUpcomingGames}
                    onChange={(e) => updateSettings({ preferUpcomingGames: e.target.checked })}
                    className="form-checkbox h-5 w-5 text-green-500 rounded focus:ring-0 bg-gray-900 border-gray-700"
                  />
                  <span className="text-gray-300">Prefer Upcoming Games</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-end mb-2">
                <button onClick={clearLogs} className="text-xs text-gray-500 hover:text-white underline">Clear Logs</button>
              </div>
              {logs.length === 0 && <div className="text-gray-500 italic text-center py-4">No logs yet.</div>}
              {logs.map(log => (
                <div key={log.id} className={`p-2 rounded border-l-2 ${
                  log.type === 'error' ? 'bg-red-900/20 border-red-500 text-red-200' :
                  log.type === 'success' ? 'bg-green-900/20 border-green-500 text-green-200' :
                  log.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500 text-yellow-200' :
                  'bg-gray-900 border-gray-600 text-gray-400'
                }`}>
                  <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-lg flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {isRunning ? 'Bot is running...' : 'Bot is stopped.'}
          </div>
          <button 
            onClick={handleStartStop}
            className={`px-6 py-2 rounded font-bold transition-colors ${
              isRunning 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isRunning ? 'STOP BOT' : 'START BOT'}
          </button>
        </div>
      </div>
    </div>
  );
}
