import { useState, useEffect } from 'react';

export function UpdaterNotification() {
    const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle');
    const [progress, setProgress] = useState<number>(0);
    const [info, setInfo] = useState<any>(null);

    const [errorMsg, setErrorMsg] = useState<string>('');

    useEffect(() => {
        // Trigger check on mount
        (window as any).electronAPI.invoke('check-for-updates');

        const unsubscribe = (window as any).electronAPI.on('update-status', (data: any) => {
            console.log('Update Status:', data);
            setStatus(data.status);
            if (data.progress) {
                setProgress(data.progress.percent);
            }
            if (data.info) {
                setInfo(data.info);
            }
            if (data.error) {
                setErrorMsg(data.error);
            }
        });

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, []);

    const handleRestart = () => {
        (window as any).electronAPI.invoke('quit-and-install');
    };
    
    const handleDownload = () => {
        (window as any).electronAPI.invoke('start-download');
        setStatus('downloading'); // Optimistic update
    };

    if (status === 'idle' || status === 'checking' || status === 'not-available') return null;

    return (
        <div className="fixed bottom-4 right-4 bg-[#1a2c38] border border-[#2f4553] p-4 rounded-lg shadow-lg z-50 w-80 animate-fade-in">
            <h3 className={`font-bold mb-2 flex items-center gap-2 ${status === 'error' ? 'text-red-500' : 'text-white'}`}>
                {status !== 'error' && <span className="w-2 h-2 bg-[#00e701] rounded-full animate-pulse"></span>}
                {status === 'error' ? 'Update Error' : 'Update Available'}
            </h3>
            
            {status === 'available' && (
                <div className="text-sm text-[#b1bad3]">
                    <p>Found v{info?.version}</p>
                    <div className="text-[10px] mt-1 text-gray-500">
                        Current: v{(window as any).electronAPI.version || '1.0.1'}
                    </div>
                    <button 
                        onClick={handleDownload}
                        className="mt-3 w-full bg-[#00e701] hover:bg-[#00c501] text-[#0f212e] font-bold py-2 rounded text-sm transition-colors"
                    >
                        Download Update
                    </button>
                </div>
            )}

            {status === 'downloading' && (
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-[#b1bad3]">
                        <span>Downloading...</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-[#0f212e] rounded-full h-1.5">
                        <div 
                            className="bg-[#00e701] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {status === 'downloaded' && (
                <div className="space-y-3">
                    <p className="text-sm text-[#b1bad3]">Update ready to install!</p>
                    <button 
                        onClick={handleRestart}
                        className="w-full bg-[#00e701] hover:bg-[#00c501] text-[#0f212e] font-bold py-2 rounded text-sm transition-colors"
                    >
                        Restart & Install
                    </button>
                </div>
            )}
            {status === 'error' && (
                <div className="text-sm text-red-500">
                    <p>Update failed.</p>
                    {errorMsg && <p className="text-[10px] mt-1 text-red-400 break-words">{errorMsg}</p>}
                </div>
            )}
        </div>
    );
}
