/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'rich-black': '#0A0A0F',
        charcoal: '#131320',
        'charcoal-light': '#1A1A2E',
        cream: '#F5F0E8',
        emerald: '#0D4F4F',
        slate: '#2D2D3D',
        'slate-light': '#8888AA',
        accent: 'var(--accent)',
        'accent-warm': 'var(--accent-warm)',
        'accent-cold': 'var(--accent-cold)',
        'accent-speed': 'var(--accent-speed)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        // Theme-aware semantic colors via CSS variables
        'bg-base': 'var(--bg-base)',
        'bg-surface': 'var(--bg-surface)',
        'bg-elevated': 'var(--bg-elevated)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'accent-shift': 'accent-shift 3s ease infinite',
        'glide': 'glide 0.4s ease-out',
        'fade-up': 'fade-up 0.6s ease-out forwards',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'speed-line': 'speed-line 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'accent-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'glide': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(var(--accent-rgb), 0.4)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'speed-line': {
          '0%, 100%': { left: '-100%' },
          '50%': { left: '200%' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, var(--accent) 0%, var(--accent-warm) 100%)',
        'dark-gradient': 'linear-gradient(180deg, #0A0A0F 0%, #131320 100%)',
      },
    },
  },
  plugins: [],
}