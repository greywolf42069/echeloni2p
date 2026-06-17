import React, { useRef, useEffect } from 'react';
import Card from './ui/Card.tsx';

interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'warn';
}

interface WasmConsoleProps {
    logs: LogEntry[];
    setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
}

const WasmConsole: React.FC<WasmConsoleProps> = ({ logs, setLogs }) => {
    const consoleEndRef = useRef<HTMLDivElement>(null);

    const logTypeStyles = {
        info: 'text-gray-400',
        success: 'text-green-400',
        error: 'text-red-400',
        warn: 'text-yellow-400',
    };

    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);
    
    const handleClear = () => {
        setLogs([{
            timestamp: new Date().toLocaleTimeString(),
            message: 'Console cleared.',
            type: 'warn',
        }]);
    };

    return (
        <Card className="!p-0 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-700">
                 <h2 className="text-xl font-semibold text-white">Live Console</h2>
                 <button
                    onClick={handleClear}
                    className="px-3 py-1 bg-slate-700/50 text-gray-300 font-semibold rounded-md hover:bg-slate-700 transition text-sm"
                 >
                    Clear Log
                </button>
            </div>
            <div className="bg-slate-900/70 p-4 font-mono text-sm h-80 overflow-y-auto">
                {logs.map((log, index) => (
                    <div key={index} className="flex gap-4">
                        <span className="text-gray-500">{log.timestamp}</span>
                        <span className={`${logTypeStyles[log.type]} whitespace-pre-wrap flex-1`}>
                           {log.type.toUpperCase()}: {log.message}
                        </span>
                    </div>
                ))}
                <div ref={consoleEndRef} />
            </div>
        </Card>
    );
};

export default WasmConsole;