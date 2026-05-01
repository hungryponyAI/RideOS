/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        condensed: ["Barlow Condensed", "DIN Condensed", "Helvetica Neue Condensed", "sans-serif"],
        data: ["Fira Code", "ui-monospace", "monospace"],
      },
      colors: {
        theme: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
        },
        brand: {
          yellow: '#FFF200',
          red: '#E10600',
          blue: '#007AFF',
          green: '#2EAD4B',
          gray: '#666666',
        },
      },
    },
  },
  plugins: [],
};
