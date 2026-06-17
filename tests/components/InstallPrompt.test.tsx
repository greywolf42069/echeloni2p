import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';

import InstallPrompt from '../../components/InstallPrompt';

const DISMISS_KEY = 'echelon.installPrompt.dismissed';

// Helpers to stub UA + display-mode + navigator.standalone per test.
function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}
function setStandalone(value: boolean) {
    Object.defineProperty(navigator, 'standalone', { value, configurable: true });
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: value && q.includes('standalone'),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
}

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function fireBeforeInstallPrompt() {
    const evt = new Event('beforeinstallprompt') as Event & {
        prompt?: () => Promise<void>;
        userChoice?: Promise<{ outcome: string }>;
    };
    evt.prompt = vi.fn().mockResolvedValue(undefined);
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => { window.dispatchEvent(evt); });
    return evt;
}

describe('InstallPrompt', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
        setStandalone(false);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing initially (no event, non-iOS)', () => {
        setUserAgent(CHROME_ANDROID);
        const { container } = render(<InstallPrompt />);
        // No beforeinstallprompt fired yet → nothing shown
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('shows the Install button after beforeinstallprompt (Android/Chrome)', () => {
        setUserAgent(CHROME_ANDROID);
        render(<InstallPrompt />);
        fireBeforeInstallPrompt();
        expect(screen.getByRole('dialog', { name: /Install Echelon/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Install$/ })).toBeInTheDocument();
    });

    it('clicking Install calls prompt()', async () => {
        setUserAgent(CHROME_ANDROID);
        render(<InstallPrompt />);
        const evt = fireBeforeInstallPrompt();
        fireEvent.click(screen.getByRole('button', { name: /^Install$/ }));
        expect(evt.prompt).toHaveBeenCalled();
    });

    it('shows the iOS Add-to-Home-Screen hint on iOS Safari', () => {
        setUserAgent(IOS_SAFARI);
        render(<InstallPrompt />);
        expect(screen.getByRole('dialog', { name: /Install Echelon/i })).toBeInTheDocument();
        expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
        // No Install button on iOS (no event API)
        expect(screen.queryByRole('button', { name: /^Install$/ })).toBeNull();
    });

    it('"Not now" dismisses and persists the dismissal', () => {
        setUserAgent(IOS_SAFARI);
        const { rerender } = render(<InstallPrompt />);
        fireEvent.click(screen.getByRole('button', { name: /Not now/i }));
        expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
        rerender(<InstallPrompt />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not show again once dismissed (even after re-mount + event)', () => {
        localStorage.setItem(DISMISS_KEY, '1');
        setUserAgent(CHROME_ANDROID);
        render(<InstallPrompt />);
        fireBeforeInstallPrompt();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('hides when already running standalone (installed)', () => {
        setStandalone(true);
        setUserAgent(IOS_SAFARI);
        render(<InstallPrompt />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('hides on appinstalled event', () => {
        setUserAgent(CHROME_ANDROID);
        render(<InstallPrompt />);
        fireBeforeInstallPrompt();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        act(() => { window.dispatchEvent(new Event('appinstalled')); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not show the iOS hint in Chrome on iOS (CriOS)', () => {
        setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148');
        render(<InstallPrompt />);
        // CriOS is Chrome on iOS — our isSafari check excludes it
        expect(screen.queryByText(/Add to Home Screen/i)).toBeNull();
    });
});
