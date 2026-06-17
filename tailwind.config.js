/** @type {import('tailwindcss').Config} */
export default {
    // Scan every source file that can contain Tailwind class names.
    // Arbitrary-value syntax (e.g. h-[40vh]) is picked up automatically
    // by the JIT engine as long as the file is in `content`.
    content: [
        './index.html',
        './App.tsx',
        './index.tsx',
        './components/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
        './config/**/*.{ts,tsx}',
        './*.{ts,tsx}',
    ],
    theme: {
        extend: {
            keyframes: {
                'spin-slow': {
                    to: { transform: 'rotate(360deg)' },
                },
            },
            animation: {
                'spin-slow': 'spin 3s linear infinite',
            },
        },
    },
    plugins: [],
};
