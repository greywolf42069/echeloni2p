import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-90 backdrop-blur-sm flex flex-col items-center justify-center z-50">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
        <div className="absolute inset-0 rounded-full border-t-4 border-purple-500 animate-spin"></div>
        <div className="absolute inset-2 rounded-full border-b-4 border-teal-400 animate-spin-slow"></div>
         <div className="absolute inset-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
        </div>
      </div>
      <p className="mt-6 text-lg text-gray-300 font-semibold tracking-wide">
        Connecting to Phantom Wallet...
      </p>
    </div>
  );
};

export default LoadingSpinner;
