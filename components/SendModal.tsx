import React, { useState, useMemo } from 'react';
import Modal from './ui/Modal.tsx';
import type { TokenBalance } from '../types';

interface SendModalProps {
    balances: TokenBalance[];
    onClose: () => void;
    onSend: (tx: { recipient: string; amount: number; token: TokenBalance }) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SendModal: React.FC<SendModalProps> = ({ balances, onClose, onSend, showToast }) => {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [selectedTokenSymbol, setSelectedTokenSymbol] = useState(balances[0]?.symbol || '');

    const selectedToken = useMemo(() => {
        return balances.find(b => b.symbol === selectedTokenSymbol);
    }, [selectedTokenSymbol, balances]);

    const handleSend = () => {
        // Basic Validation
        if (!recipient.trim() || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipient.trim())) {
            showToast('Please enter a valid Solana address.', 'error');
            return;
        }
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            showToast('Please enter a valid amount.', 'error');
            return;
        }
        if (!selectedToken || numericAmount > selectedToken.balance) {
            showToast('Insufficient balance.', 'error');
            return;
        }

        onSend({
            recipient: recipient.trim(),
            amount: numericAmount,
            token: selectedToken,
        });
    };

    return (
        <Modal title="Send Funds" onClose={onClose}>
            <div className="space-y-4">
                {/* Recipient */}
                <div>
                    <label className="text-sm text-gray-400 block mb-1">Recipient</label>
                    <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="Enter Solana address"
                        className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono"
                    />
                </div>

                {/* Asset & Amount */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-2">
                     <div className="flex-grow">
                        <label className="text-sm text-gray-400 block mb-1">Amount</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500"
                        />
                    </div>
                     <div className="w-full sm:w-1/3">
                        <label className="text-sm text-gray-400 block mb-1">Asset</label>
                        <select 
                            value={selectedTokenSymbol}
                            onChange={(e) => setSelectedTokenSymbol(e.target.value)}
                            className="w-full h-[46px] bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500"
                        >
                            {balances.map(token => (
                                <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                {selectedToken && (
                    <div className="text-xs text-right text-gray-400 -mt-2">
                        Balance: {selectedToken.balance.toLocaleString()} {selectedToken.symbol}
                         <button 
                            onClick={() => setAmount(selectedToken.balance.toString())}
                            className="ml-2 font-semibold text-purple-400 hover:text-purple-300"
                        >
                            Max
                        </button>
                    </div>
                )}


                {/* Action Button */}
                <div className="pt-4">
                    <button 
                        onClick={handleSend}
                        className="w-full bg-purple-600 text-white font-semibold py-3 rounded-lg hover:bg-purple-700 transition text-lg"
                    >
                        Send Transaction
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SendModal;