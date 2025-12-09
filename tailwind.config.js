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
          50: '#f7fef0',
          100: '#edfcdc',
          200: '#ddf9ba',
          300: '#c5f48d',
          400: '#b5f27e',
          500: '#A6F074', // Main color
          600: '#8dd95f',
          700: '#6fb847',
          800: '#569237',
          900: '#3f6b29',
          950: '#2a4a1b',
        },
        secondary: {
          50: '#f5f5f4',
          100: '#e7e5e4',
          200: '#d6d3d1',
          300: '#a8a29e',
          400: '#78716c',
          500: '#57534e',
          600: '#44403c',
          700: '#292524',
          800: '#211D1D', // Main dark color
          900: '#1a1716',
          950: '#0c0a09',
        },
        other: {
          red001: '#fa104a',
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