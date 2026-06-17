import React from 'react';
import Card from './ui/Card.tsx';
import type { Page, Eepsite } from '../types';

interface EepsiteHostingCardProps {
    eepsites: Eepsite[];
    setPage: (page: Page) => void;
}

const ServerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
);

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);

const EepsiteHostingCard: React.FC<EepsiteHostingCardProps> = ({ eepsites, setPage }) => {
    const onlineCount = eepsites.filter(site => site.status === 'Online').length;
    
    return (
        <Card>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <ServerIcon />
                    <div>
                        <h2 className="text-xl font-semibold text-white">Eepsite Hosting</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            {onlineCount > 0 ? `You are hosting ${onlineCount} site${onlineCount > 1 ? 's' : ''}.` : 'Host your own private website on the I2P network.'}
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => setPage('eepsite-hosting')}
                    className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition bg-slate-700 hover:bg-slate-600 text-white"
                >
                    <span>Manage Eepsites</span>
                    <ArrowRightIcon />
                </button>
            </div>
        </Card>
    );
};

export default EepsiteHostingCard;
