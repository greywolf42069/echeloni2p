import React, { useState } from 'react';
import { WalletModalButton } from '@solana/wallet-adapter-react-ui';

interface OnboardingJourneyProps {
  onClose: () => void;
}

const journeySteps = [
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.08-1.945.24-2.869M10.5 18v-.192c0-.983-.08-1.945-.24-2.869M3.75 18v-.192c0-.983.08-1.945.24-2.869m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M19.5 18v-.192c0-.983-.08-1.945-.24-2.869m-3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0" /></svg>,
    title: 'Your Phone Becomes a Private Web Server',
    text: 'Run real websites on I2P directly from your phone. No VPS. No cloud. No one can take them down. Complete sovereignty over your presence on the internet.',
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>,
    title: 'AI That Actually Understands Your Site',
    text: 'The AI IDE sees your full project, your git history, and your uncommitted changes. It helps you build beautiful private websites with real intelligence — not generic suggestions.',
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0v3.75" /></svg>,
    title: 'Real Git History for Every Site',
    text: 'Every eepsite you create gets its own professional git repository. Commit changes, view history, and roll back versions — all inside the browser. Your private sites deserve real engineering.',
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>,
    title: 'Publish From Your Phone in One Tap',
    text: 'Edit on your phone. Hit publish. Your site goes live on I2P through your own connection. No servers to rent. No one to ask permission from. This is what true digital independence feels like.',
  },
];

const OnboardingJourney: React.FC<OnboardingJourneyProps> = ({ onClose }) => {
    const [step, setStep] = useState(0);
    const currentStep = journeySteps[step];
    
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-8 text-center">
                 <button 
                    onClick={onClose} 
                    className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors p-1"
                    aria-label="Close"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="mb-7 flex justify-center">{currentStep.icon}</div>
                
                <h2 className="text-2xl font-semibold text-white tracking-tight mb-3 leading-tight">
                    {currentStep.title}
                </h2>
                <p className="text-gray-300 leading-relaxed text-[15px] mb-9">
                    {currentStep.text}
                </p>
                
                <div className="flex items-center justify-center gap-2 mb-8">
                    {journeySteps.map((_, index) => (
                        <div 
                            key={index} 
                            className={`h-1.5 rounded-full transition-all ${step === index ? 'w-6 bg-purple-500' : 'w-2 bg-slate-600'}`}
                        />
                    ))}
                </div>

                {step < journeySteps.length - 1 ? (
                     <button
                        onClick={() => setStep(step + 1)}
                        className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold py-3.5 rounded-2xl transition-all text-[15px] tracking-wide shadow-lg shadow-purple-950/50"
                    >
                        Continue
                    </button>
                ) : (
                    <button
                        onClick={onClose}
                        className="w-full bg-white hover:bg-gray-100 active:bg-gray-200 text-slate-900 font-semibold py-3.5 rounded-2xl transition-all text-[15px] tracking-wide shadow-lg"
                    >
                        Start Building Your First Site
                    </button>
                )}
            </div>
        </div>
    );
};

export default OnboardingJourney;