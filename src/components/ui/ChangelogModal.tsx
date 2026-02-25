import React from 'react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  changes: string[];
}

export function ChangelogModal({ isOpen, onClose, version, changes }: ChangelogModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a2c38] border border-[#2f4553] rounded-lg shadow-2xl w-[500px] max-w-[90vw] overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="bg-[#0f212e] px-6 py-4 border-b border-[#2f4553] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#00e701]/10 p-2 rounded-full">
              <svg className="w-6 h-6 text-[#00e701]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">What's New</h2>
              <p className="text-xs text-[#b1bad3] font-mono">Version {version}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-[#b1bad3] hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {changes.length > 0 ? (
            <ul className="space-y-3">
              {changes.map((change, index) => (
                <li key={index} className="flex items-start gap-3 text-[#b1bad3]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#00e701] shrink-0" />
                  <span className="leading-relaxed">{change}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[#b1bad3] italic">No detailed release notes for this version.</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-2 bg-[#1a2c38]">
          <button
            onClick={onClose}
            className="w-full bg-[#00e701] hover:bg-[#00c501] text-[#0f212e] font-bold py-3 rounded-md transition-all shadow-[0_0_15px_rgba(0,231,1,0.2)] hover:shadow-[0_0_20px_rgba(0,231,1,0.4)]"
          >
            Awesome!
          </button>
        </div>
      </div>
    </div>
  );
}
