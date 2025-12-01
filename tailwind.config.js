/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <--- เช็คว่ามีบรรทัดนี้ (สำคัญสำหรับปุ่ม Dark mode)
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // <--- เช็คว่ามีบรรทัดนี้ เพื่อให้ Tailwind สแกนไฟล์ในโฟลเดอร์ src
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae1fd',
          300: '#7ccafb',
          400: '#36aef4',
          500: '#0c91e4',
          600: '#0074c2',
          700: '#005c9e',
          800: '#064f84',
          900: '#0a426d',
          950: '#062947',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.1)',
          DEFAULT: 'rgba(255, 255, 255, 0.2)',
          dark: 'rgba(0, 0, 0, 0.1)',
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glass-sm': '0 4px 16px 0 rgba(31, 38, 135, 0.25)',
        'glass-lg': '0 16px 48px 0 rgba(31, 38, 135, 0.45)',
        'subtle': '0 2px 8px -2px rgba(0, 0, 0, 0.05)',
        'float': '0 8px 16px -4px rgba(0, 0, 0, 0.1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-subtle': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
      },
    },
    fontFamily: {
      sans: ['Inter var', 'ui-sans-serif', 'system-ui'],
      display: ['SF Pro Display', 'Inter var', 'system-ui'],
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}