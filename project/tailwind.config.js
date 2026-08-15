/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'primary-bg':    '#fafaf5',
        navy:            '#2a3c77',
        'star-yellow':   '#fbe281',
        'sunset-orange': '#cb6b3d',
        'warm-gray':     '#c1af9b',
        burgundy:        '#402b38',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
