/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stake: {
          success: '#00e701',
          error: '#ff4d4d',
          brand: '#1475e1',
          warning: '#ffb347',
          'bg-deep': '#0f212e',
          'bg-card': '#1a2c38',
          border: '#2f4553',
          'border-hover': '#3d5566',
          'text-muted': '#b1bad3',
          'text-dim': '#55657e',
        },
      },
    },
  },
  plugins: [],
}