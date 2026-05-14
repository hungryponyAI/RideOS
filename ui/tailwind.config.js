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
          bgSecondary: 'var(--bg-secondary)',
          surface: 'var(--surface)',
          surfaceSoft: 'var(--surface-soft)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          accent: 'var(--accent)',
          accentMuted: 'var(--accent-muted)',
          success: 'var(--success)',
          warning: 'var(--warning)',
          critical: 'var(--critical)',
        },
        brand: {
          // OUDENA palette
          glacier: '#74AFCB',
          titanium: '#68707A',
          success: '#6BAA75',
          warning: '#C59A52',
          critical: '#C76D6D',
          // Legacy — kept for components not yet restyled (phases 5–10)
          yellow: '#FFF200',
          red: '#E10600',
          blue: '#007AFF',
          green: '#2EAD4B',
          gray: '#666666',
          strava: '#FC4C02',
        },
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)',
      },
      transitionTimingFunction: {
        oudena: 'var(--ease-oudena)',
      },
      transitionDuration: {
        tap: '120ms',
        panel: '300ms',
      },
    },
  },
  plugins: [],
};
