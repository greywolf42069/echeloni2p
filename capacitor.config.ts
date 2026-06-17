import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.echelon.app',
    appName: 'Echelon',
    webDir: 'dist',
    server: {
        // Use HTTPS scheme in the WebView so service workers and
        // secure contexts behave like a normal PWA.
        androidScheme: 'https',
    },
    android: {
        // No mixed content — all resources must be HTTPS or same-origin.
        allowMixedContent: false,
    },
};

export default config;
