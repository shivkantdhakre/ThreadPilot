import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-jakarta)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // Ink dark surfaces
        ink: {
          950: '#07070A',
          900: '#0B0B0F',
          850: '#111116',
          800: '#17171C',
          700: '#23232B',
          600: '#2E2E38',
          500: '#40404C',
        },
        // Primary brand: Coral
        coral: {
          50: '#FFF5F2',
          100: '#FFE9E3',
          200: '#FFD3C7',
          300: '#FFAEA0',
          400: '#FF8A72',
          500: '#FF6B4A',
          600: '#FF5722',
          700: '#E64413',
          800: '#BF340B',
          900: '#942706',
          950: '#521402',
        },
        // Secondary accent: Violet
        violet: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#A855F7',
          500: '#7C3AED',
          600: '#6D28D9',
          700: '#5B21B6',
          800: '#4C1D95',
          900: '#3B0764',
        },
        // Interactive accent: Cyan
        cyan: {
          50: '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#00ADB5',
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
        },
        // Success accent: Lime
        lime: {
          50: '#F7FEE7',
          100: '#ECFCCB',
          200: '#D9F99D',
          300: '#C4F857',
          400: '#B8F34A',
          500: '#A3E635',
          600: '#65A30D',
        },
        // Editorial paper & light-first canvas neutrals
        paper: '#F7F4EE',
        'warm-white': '#FFFDF8',
        ivory: '#FFFCF7',
        cream: '#FFF7EF',
        'canvas-neutral': '#F5F5F3',
        charcoal: '#151515',
        'deep-ink': '#0D1018',
        'soft-lavender': '#B8BDF7',
        'muted-sage': '#78A99A',
        'electric-orange': '#FF7A18',
        'electric-purple': '#A855F7',
        'pacific-cyan': '#00ADB5',
        'electric-cyan': '#22D3EE',
        // Map brand to coral for smooth integration
        brand: {
          50: '#FFF5F2',
          100: '#FFE9E3',
          200: '#FFD3C7',
          300: '#FFAEA0',
          400: '#FF8A72',
          500: '#FF6B4A',
          600: '#FF5722',
          700: '#E64413',
          800: '#BF340B',
          900: '#942706',
          950: '#521402',
        },
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(255, 107, 74, 0.35)',
        'glow-violet': '0 0 25px -5px rgba(124, 58, 237, 0.35)',
        'glow-cyan': '0 0 25px -5px rgba(0, 173, 181, 0.35)',
        'card-elevated': '0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
