// 화면 스타일 다시 만들기: npx tailwindcss@3.4.17 -c tailwind.config.js -i tailwind.in.css -o tailwind.css --minify
// 디자인 개편 1단계 (2026.11): 하늘색(sky) 계열을 차분한 먹색 계열로 바꿔 씀. 경고·오늘 표시는 다른 색(amber·rose·emerald 등) 그대로.
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        sky: {
          50: '#f5f6f7', 100: '#eceef0', 200: '#dfe2e6', 300: '#c9ced4', 400: '#9aa3ab',
          500: '#6c757d', 600: '#495057', 700: '#343a40', 800: '#2b3035', 900: '#212529', 950: '#16191c'
        }
      }
    }
  },
  plugins: []
};
