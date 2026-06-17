import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import OnboardingJourney from '../OnboardingJourney.tsx';
import XMBWaveBackground from '../XMBWaveBackground.tsx';

interface WelcomeProps {
    onDevLogin: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onDevLogin }) => {
    const [showJourney, setShowJourney] = useState(false);
    const [isInIframe, setIsInIframe] = useState(false);

    useEffect(() => {
        try {
            // Check if the window is in an iframe
            if (window.self !== window.top) {
                setIsInIframe(true);
            }
        } catch (e) {
            // A SecurityError may be thrown in some cross-origin iframe scenarios.
            // We can assume it's in an iframe if we can't check.
            console.warn("Could not determine iframe status due to security restrictions.");
            setIsInIframe(true);
        }
    }, []);
    
    const WarningIcon = ({ className = "h-8 w-8 flex-shrink-0" }) => (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
    );


    return (
        <div className="relative isolate min-h-screen flex flex-col items-center justify-center text-white text-center p-4 overflow-hidden">
            {isInIframe && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-3xl p-4 z-20">
                    <div className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded-lg p-4 flex items-start sm:items-center gap-4 shadow-lg">
                        <WarningIcon />
                        <div className="text-left">
                            <h3 className="font-bold text-yellow-200">Wallet Connection Notice</h3>
                            <p className="text-sm">
                                Wallet interaction may be limited in this embedded view. For full functionality, please 
                                <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-yellow-100"> open the app in a new tab</a>.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            <XMBWaveBackground />

            <div className="flex items-center mb-6">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 <span className="ml-4 text-4xl font-bold tracking-wider text-white">Echelon</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold !leading-tight tracking-tight mb-4">
                Join the <span className="text-purple-400">Incentivized</span>, <span className="text-teal-400">Private</span> Meshnet.
            </h1>
            <p className="max-w-2xl text-lg text-gray-300 mb-8">
                Become an active participant in a self-healing, decentralized I2P network. Earn rewards for securing the web, all powered by Solana.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
                <div className="w-full sm:w-auto">
                    <WalletMultiButton />
                </div>
                <button
                    onClick={() => setShowJourney(true)}
                    className="w-full sm:w-auto text-sm bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 text-white font-semibold py-3 px-5 rounded-lg transition-colors duration-300"
                >
                    Learn More
                </button>
            </div>

            <button
                onClick={onDevLogin}
                className="absolute bottom-4 right-4 text-xs text-gray-600 hover:text-purple-400 transition-colors py-1 px-2 rounded"
            >
                Developer
            </button>

            {showJourney && (
                <OnboardingJourney 
                    onClose={() => setShowJourney(false)}
                />
            )}
        </div>
    );
};

export default Welcome;