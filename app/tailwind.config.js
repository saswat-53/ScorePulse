/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' avoids a NativeWind web error ("Cannot manually set color scheme") that 'media' triggers.
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Neon dark palette taken from the UI mockup (ScorePulse Neon Football App UI.png).
      // Tune these once real screens exist; they are a starting point, not a final design.
      colors: {
        bg: '#050B18',
        surface: '#0B1527',
        'surface-2': '#111E36',
        border: '#1B2D4D',
        neon: '#19E3FF',
        live: '#2BE38A',
        danger: '#FF3B47',
        muted: '#8FA3C0',
        soft: '#B9C6E0',
        warn: '#FFB020',
        card: '#F5C518',
      },
    },
  },
  plugins: [],
};
