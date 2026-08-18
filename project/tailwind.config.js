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
        // 글자용. warm-gray 를 그대로 글자에 쓰면 배경(#fafaf5)과
        // 명암비가 2.03:1 이라 읽기 어렵다. 같은 계열로 어둡게 잡아 4.98:1.
        'warm-text':     '#7a6a58',
        burgundy:        '#402b38',
      },
      fontFamily: {
        sans: ['Nunito', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
