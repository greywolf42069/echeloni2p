/**
 * Platform detection for runtime branching between web and native paths.
 *
 * When running inside a Capacitor WebView on Android, we use the
 * Mobile Wallet Adapter (MWA) so users sign with Seed Vault on
 * Saga / Seeker.  On every other platform (iOS, desktop browser,
 * Termux PWA) we fall back to the standard browser-extension
 * adapters (Phantom, Solflare).
 *
 * Safe by default: if the @capacitor/core module isn't installed
 * (pure-web build), every check returns false.
 */

let _isNative: boolean | null = null;

/**
 * True when running inside a Capacitor native shell.
 * Caches the result after first call.
 */
export function isNativePlatform(): boolean {
    if (_isNative !== null) return _isNative;
    try {
        // Dynamic import guard — if @capacitor/core isn't bundled
        // this catch prevents a crash in the browser build.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Capacitor } = require('@capacitor/core');
        _isNative = Capacitor.isNativePlatform();
    } catch {
        _isNative = false;
    }
    return _isNative;
}

/**
 * True when running on Android (native Capacitor shell).
 * Implies isNativePlatform().
 */
export function isAndroid(): boolean {
    if (!isNativePlatform()) return false;
    try {
        const { Capacitor } = require('@capacitor/core');
        return Capacitor.getPlatform() === 'android';
    } catch {
        return false;
    }
}
