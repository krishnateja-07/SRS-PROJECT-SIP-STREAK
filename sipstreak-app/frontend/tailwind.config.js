/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#030b1a', ocean: '#06183a', deep: '#0a2350',
        cyan: { glow: '#00e5ff' }, aqua: '#3ee6d4', turq: '#1fc8b4', neon: '#39ff88', coral: '#ff7a59', ember: '#ff6a2b',
      },
      fontFamily: { editorial: ['Instrument Serif', 'Georgia', 'serif'], display: ['Outfit', 'system-ui', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 0 24px rgba(0,229,255,.35)', neon: '0 0 24px rgba(57,255,136,.45)' },
    },
  },
  plugins: [],
}
