import React from 'react';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
    return (
        <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-xl flex flex-col"
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
            >
                <div className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-white rounded-full hover:bg-slate-700/50 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 flex-grow">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
