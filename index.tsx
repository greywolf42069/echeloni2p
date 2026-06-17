// Patch window.fetch, self.fetch, and globalThis.fetch to prevent polyfill write errors in restricted iframe environments
try {
  const patchFetch = (obj: any) => {
    if (!obj) return;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, 'fetch') || 
                         Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), 'fetch');
      if (descriptor && !descriptor.set) {
        let currentFetch = obj.fetch;
        Object.defineProperty(obj, 'fetch', {
          configurable: true,
          enumerable: true,
          get() {
            return currentFetch;
          },
          set(v) {
            currentFetch = v;
          }
        });
        console.log('[FetchPatch] Successfully patched fetch descriptor on', obj === window ? 'window' : (obj === self ? 'self' : 'globalThis'));
      }
    } catch (e) {
      console.warn('[FetchPatch] Failed to patch object fetch property:', e);
    }
  };
  patchFetch(window);
  patchFetch(self);
  patchFetch(globalThis);
} catch (globalError) {
  console.error('[FetchPatch] Critical error during fetch patching:', globalError);
}

import { Buffer } from 'buffer';
// Fix: Property 'Buffer' does not exist on type 'Window'. Cast to any to assign polyfill.
(window as any).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import WalletContextProvider from './components/WalletContextProvider.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </React.StrictMode>
);
