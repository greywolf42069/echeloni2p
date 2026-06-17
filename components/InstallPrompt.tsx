import React, { useEffect, useState } from 'react';

/**
 * Install prompt for both platforms:
 *
 *  • Android / desktop Chrome: capture the `beforeinstallprompt` event,
 *    suppress the mini-infobar, and show our own "Install Echelon"
 *    button that calls prompt() on click.
 *
 *  • iOS Safari: there is NO install event — the only path is
 *    Share → Add to Home Screen. We detect iOS Safari (not already
 *    standalone) and show a dismissible hint explaining the gesture.
 *
 * Dismissal is remembered in localStorage so we never nag. The banner
 * also self-hides once the app is running in standalone display mode
 * (i.e. already installed).
 */

const DISMISS_KEY = 'echelon.installPrompt.dismissed';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const mql = window.matchMedia?.('(display-mode: standalone)');
    // iOS Safari uses navigator.standalone
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return Boolean(mql?.matches) || iosStandalone;
}

function isIosSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
        // iPadOS 13+ reports as Mac; detect touch + Mac
        (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
    return isIos && isSafari;
}

function wasDismissed(): boolean {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

const ShareIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
);

const InstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showIosHint, setShowIosHint] = useState(false);
    const [dismissed, setDismissed] = useState(() => wasDismissed());

    useEffect(() => {
        if (dismissed || isStandalone()) return;

        // Android / desktop: capture the install event.
        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);

        // iOS: no event — show the manual hint if Safari + not installed.
        if (isIosSafari()) {
            setShowIosHint(true);
        }

        // Hide everything once the app gets installed.
        const onInstalled = () => {
            setDeferredPrompt(null);
            setShowIosHint(false);
        };
        window.addEventListener('appinstalled', onInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, [dismissed]);

    const dismiss = () => {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(DISMISS_KEY, '1');
        } catch { /* ignore */ }
        setDismissed(true);
        setDeferredPrompt(null);
        setShowIosHint(false);
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
    };

    if (dismissed) return null;
    if (!deferredPrompt && !showIosHint) return null;

    return (
        <div
            role="dialog"
            aria-label="Install Echelon"
            className="fixed bottom-20 left-2 right-2 sm:left-auto sm:right-4 sm:w-96 z-30 bg-slate-900 border border-purple-500/40 rounded-xl shadow-xl p-4"
        >
            <div className="flex items-start gap-3">
                <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                    <p className="font-semibold text-white">Install Echelon</p>
                    {deferredPrompt ? (
                        <p className="text-sm text-gray-400 mt-1">
                            Add Echelon to your home screen for full-screen, offline-capable access.
                        </p>
                    ) : (
                        <p className="text-sm text-gray-400 mt-1">
                            Tap <ShareIcon /> <span className="text-gray-200">Share</span>, then{' '}
                            <span className="text-gray-200">Add to Home Screen</span> to install Echelon.
                        </p>
                    )}
                    <div className="flex gap-2 mt-3">
                        {deferredPrompt && (
                            <button
                                onClick={handleInstall}
                                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition"
                            >
                                Install
                            </button>
                        )}
                        <button
                            onClick={dismiss}
                            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-gray-200 text-sm font-semibold rounded-lg transition"
                        >
                            Not now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
