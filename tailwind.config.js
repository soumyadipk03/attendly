/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.2), 0 18px 60px rgba(15,23,42,0.45)',
      },
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9f1ff',
          500: '#5ec3ff',
          600: '#2ea5f8',
        },
      },
    },
  },
  plugins: [],
}

