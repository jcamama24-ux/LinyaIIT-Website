/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: '#fdf2f3',
          100: '#fce7e9',
          200: '#f9d2d6',
          300: '#f3adb4',
          400: '#ea7d89',
          500: '#dd5061',
          600: '#c72f44',
          700: '#a62236',
          800: '#8b1e2e',
          900: '#761c2a',
          950: '#420a13',
        },
        gold: {
          50: '#fdfaf0',
          100: '#faf1d4',
          200: '#f4dfa8',
          300: '#ecc672',
          400: '#e2a63b',
          500: '#c58b1f',
          600: '#a96e17',
          700: '#885115',
          800: '#714118',
          900: '#5f3719',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
