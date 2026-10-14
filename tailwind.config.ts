import type { Config } from 'tailwindcss'

// Redesign tokens (see the FreshTrack Redesign canvas). Status colours differ in lightness as well
// as hue so they stay distinguishable for colour-blind staff; chart colours were checked the same way.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        display: ['Archivo', '"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: { 50: '#edf8f3', 100: '#E3F5EC', 500: '#14805c', 600: '#0D6B4F', 700: '#0A523E' },
        ink: '#13201A',
        muted: '#4A5A52',
        ground: '#F4F6F3',
        line: '#C9D3CD',
        hairline: '#DCE3DF',
        recheck: '#1D5FB5',
        overdue: '#B42318',
        soon: '#B54708',
        sold: '#15936A',
        removed: '#D06A10',
      },
      boxShadow: { card: '0 1px 2px rgba(19, 32, 26, .06)' },
    },
  },
  plugins: [],
} satisfies Config
