import React, { useState, useEffect } from 'react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onDismiss: () => void;
}

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const SuccessIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const Toast: React.FC<ToastProps> = ({ message, type, onDismiss }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Animate in
        setIsVisible(true);

        const timer = setTimeout(() => {
            // Animate out
            setIsVisible(false);
            // Call dismiss after animation
            setTimeout(onDismiss, 300); 
        }, 3000);

        return () => clearTimeout(timer);
    }, [message, type, onDismiss]);
    
    const baseClasses = "fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-sm p-4 rounded-xl shadow-lg flex items-center gap-3 z-50 transition-all duration-300 ease-out";
    const visibilityClasses = isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4';
    
    const typeConfig = {
        success: {
            bg: 'bg-green-500/20 border border-green-500/30 backdrop-blur-sm',
            icon: <SuccessIcon />,
            text: 'text-green-200'
        },
        error: {
            bg: 'bg-red-500/20 border border-red-500/30 backdrop-blur-sm',
            icon: <ErrorIcon />,
            text: 'text-red-200'
        },
        info: {
            bg: 'bg-blue-500/20 border border-blue-500/30 backdrop-blur-sm',
            icon: <InfoIcon />,
            text: 'text-blue-200'
        }
    };
    
    const config = typeConfig[type];

    return (
        <div className={`${baseClasses} ${visibilityClasses} ${config.bg}`}>
            {config.icon}
            <p className={`font-semibold text-sm ${config.text}`}>{message}</p>
        </div>
    );
};

export default Toast;
