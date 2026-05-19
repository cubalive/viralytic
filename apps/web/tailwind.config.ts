import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: { DEFAULT: '#0B0B0F', 50: '#14141A', 100: '#1C1C24' },
        magenta: { DEFAULT: '#FF0066', 600: '#E60059' },
        cyan: { brand: '#00E5FF' },
        neon: '#39FF14',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
