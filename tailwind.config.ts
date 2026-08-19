import type { Config } from 'tailwindcss'
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: { 50: '#edf8f3', 100: '#d6f0e3', 500: '#14805c', 600: '#0d6b4f', 700: '#0a523e' } }, boxShadow: { card: '0 3px 18px rgba(15, 65, 46, .08)' } } }, plugins: [] } satisfies Config
