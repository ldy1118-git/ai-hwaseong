/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        hwaseong: {
          blue:  '#1A56DB',
          light: '#EBF5FF',
          green: '#057A55',
          amber: '#C27803',
        },
      },
      fontFamily: {
        sans: ['Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
