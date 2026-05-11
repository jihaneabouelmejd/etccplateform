import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        honey: {
          dark: '#1A141A',
          brown: '#A33C00',
          caramel: '#A33C00',
          beige: '#C8A96E',
          'beige-soft': '#EDDEC1',
          cream: '#FBF6EE',
          gold: '#EBB800',
          orange: '#755C00',
        },
        status: {
          success: '#4CAF50',
          warning: '#FF9800',
          danger: '#D32F2F',
          info: '#1976D2',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Outfit', 'DM Sans', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        'honey-sm': '0 1px 2px rgba(163, 60, 0, 0.06)',
        'honey-md': '0 2px 8px rgba(163, 60, 0, 0.08)',
        'honey-lg': '0 4px 16px rgba(163, 60, 0, 0.12)',
        'honey-glow': '0 2px 12px rgba(235, 184, 0, 0.35)',
      },
      backgroundImage: {
        'honey-gradient': 'linear-gradient(135deg, #EBB800 0%, #755C00 100%)',
        'honey-gradient-soft': 'linear-gradient(135deg, rgba(235,184,0,0.15) 0%, rgba(117,92,0,0.15) 100%)',
        'honey-gradient-subtle': 'linear-gradient(135deg, #FBF6EE 0%, #F3E8C8 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
