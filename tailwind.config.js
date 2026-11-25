/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        simpal: {
          dark: '#0a192f',
          navy: '#102a43',
          gold: '#f59e0b',
          amber: '#fbbf24',
        }
      }
    },
  },
  plugins: [],
}
