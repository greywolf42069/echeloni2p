import React from 'react';
import Card from './ui/Card.tsx';
import type { WasmStatus } from '../types';

interface ProtectionStatusCardProps {
    wasmStatus: WasmStatus;
    isNative: boolean;
    systemProxyEnabled: boolean;
}

const ShieldIcon: React.FC<{ color: string }> = ({ color }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-16 w-16 transition-colors duration-500 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

const ProtectionStatusCard: React.FC<ProtectionStatusCardProps> = ({
    wasmStatus,
    isNative,
    systemProxyEnabled,
}) => {
    const isWasmRunning = wasmStatus === 'running';

    const getStatus = () => {
        if (isWasmRunning && isNative && systemProxyEnabled) {
            return {
                level: 'high',
                title: 'System-Wide Protection',
                description: 'The i2pw router and native proxy are active. All traffic on your device is being routed through the Echelon meshnet.',
                color: 'text-green-400',
                bg: 'bg-green-500/10 border-green-500/30'
            };
        }
        if (isWasmRunning) {
            return {
                level: 'medium',
                title: 'Partial Protection',
                description: 'The in-browser i2pw router is active. Only traffic from this app (e.g., the I2P Explorer) is being routed through the Echelon meshnet.',
                color: 'text-yellow-400',
                bg: 'bg-yellow-500/10 border-yellow-500/30'
            };
        }
        return {
            level: 'low',
            title: 'Protection Inactive',
            description: 'The i2pw router is not running. Your traffic is not being routed through the Echelon meshnet.',
            color: 'text-red-400',
            bg: 'bg-red-500/10 border-red-500/30'
        };
    };
    
    const status = getStatus();

    return (
        <Card className={`!p-0 overflow-hidden border ${status.bg}`}>
            <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                    <ShieldIcon color={status.color} />
                </div>
                <div>
                    <h2 className={`text-2xl font-bold ${status.color}`}>{status.title}</h2>
                    <p className="text-gray-400 mt-1">{status.description}</p>
                </div>
            </div>
        </Card>
    );
};

export default ProtectionStatusCard;