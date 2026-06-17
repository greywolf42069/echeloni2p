import React from 'react';
import Modal from './ui/Modal.tsx';

interface ReceiveModalProps {
    publicKey: string;
    onClose: () => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const ReceiveModal: React.FC<ReceiveModalProps> = ({ publicKey, onClose, showToast }) => {

    const handleCopy = () => {
        if (!publicKey) return;
        navigator.clipboard.writeText(publicKey);
        showToast('Address copied to clipboard!', 'success');
    };

    // Using a placeholder QR code service
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(publicKey || ' ')}&bgcolor=1E293B&color=F1F5F9&qzone=1`;

    return (
        <Modal title="Receive Funds" onClose={onClose}>
            <div className="space-y-6 text-center">
                <div className="bg-slate-700 p-4 rounded-lg inline-block">
                    {publicKey ? 
                        <img src={qrCodeUrl} alt="Wallet Address QR Code" className="w-48 h-48 rounded-md" /> :
                        <div className="w-48 h-48 rounded-md bg-slate-800 animate-pulse"></div>
                    }
                </div>
                <div>
                    <p className="text-sm text-gray-400 mb-2">Your Solana Address</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={publicKey}
                            className="w-full bg-slate-700 text-gray-300 p-3 rounded-lg border border-slate-600 font-mono text-sm"
                        />
                         <button 
                            onClick={handleCopy}
                            disabled={!publicKey}
                            className="px-4 py-3 font-semibold rounded-lg transition bg-purple-600 hover:bg-purple-700 flex items-center justify-center disabled:bg-slate-600"
                            aria-label="Copy address"
                        >
                            <CopyIcon/>
                        </button>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                    Done
                </button>
            </div>
        </Modal>
    );
};

export default ReceiveModal;