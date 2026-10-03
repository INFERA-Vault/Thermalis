/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        thermal: {
          bg: '#08090b',
          'bg-elevated': '#0c0e11',
          'bg-subtle': '#111318',
          surface: '#14171b',
          'surface-hover': '#181b20',
          'surface-elevated': '#1d2025',
          border: '#262322',
          'border-subtle': '#1f1d1c',
          'border-light': '#383330',
          text: '#f4f4f5',
          'text-muted': '#94908d',
          'text-dim': '#686360',
        },
        fire: {
          red: '#ff0000',
          orange: '#ff5a00',
          amber: '#ff9f00',
          gold: '#ffd000',
          yellow: '#ffe500',
          'deep-wine': '#611511',
          'deep-crimson': '#9a0000',
          'deep-rust': '#b62602',
          'deep-blaze': '#e74d02',
          'warm-amber': '#fcb42c',
        },
        severity: {
          low: '#fcb42c',
          medium: '#ff9f00',
          high: '#e74d02',
          critical: '#ff0000',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace', 'Consolas'],
      },
    },
  },
  plugins: [],
};
