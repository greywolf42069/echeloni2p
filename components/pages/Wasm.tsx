import React from 'react';
import Card from '../ui/Card.tsx';
import type { Page } from '../../types';

interface WasmProps {
    setPage: (page: Page) => void;
}

/**
 * The old in-browser "i2pw" router was simulated. Real I2P is now
 * provided by an actual `i2pd` running under Termux on the device.
 * This page just funnels users to the right place.
 */
const Wasm: React.FC<WasmProps> = ({ setPage }) => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Router</h1>
            <Card>
                <h2 className="text-xl font-semibold text-white mb-2">Echelon now uses real i2pd</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Echelon does not embed an I2P router in the browser. Instead it talks to a
                    real <code className="text-teal-300">i2pd</code> instance you run via Termux on the same
                    Android device. All router status, controls and stats live on the Protect page.
                </p>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setPage('protect')}
                        className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                    >
                        Open Protect →
                    </button>
                    <button
                        onClick={() => setPage('native')}
                        className="px-5 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                    >
                        Termux quickstart →
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default Wasm;
