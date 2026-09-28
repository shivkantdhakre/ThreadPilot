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
        sans: ['var(--font-jakarta)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['var(--font-jakarta)', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
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
        // Light-First Foundation Neutrals
        paper: '#F7F4EE',
        'warm-white': '#FFFDF8',
        'soft-gray': '#F4F3F0',
        'canvas-border': '#E8E5DF',
        'canvas-border-muted': '#DDD9D1',
        'text-primary': '#151518',
        'text-secondary': '#5F5D61',
        'text-muted': '#8A8784',
        'deep-ink': '#0B0B0F',
        ivory: '#FFFDF8',
        cream: '#FFF7EF',
        charcoal: '#151518',
        'soft-lavender': '#B8BDF7',
        'muted-sage': '#78A99A',

        // Primary brand: Coral / Lava Orange
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
        'lava-orange': '#FF5722',
        'electric-orange': '#FF7A18',

        // Secondary accent: Electric Violet
        violet: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#A855F7',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        'electric-purple': '#A855F7',

        // Interactive accent: Pacific Cyan
        cyan: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#22D3EE',
          500: '#00ADB5',
          600: '#0891B2',
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
        },
        'pacific-cyan': '#00ADB5',
        'electric-cyan': '#22D3EE',

        // Positive signal: Lime
        lime: {
          50: '#F7FEE7',
          100: '#ECFCCB',
          200: '#D9F99D',
          300: '#BEF264',
          400: '#B8F34A',
          500: '#84CC16',
          600: '#65A30D',
          700: '#4D7C0F',
          800: '#3F6212',
          900: '#365314',
        },

        // Legacy dark inks (retained for dark hero marketing accents & visualizations)
        ink: {
          950: '#07070A',
          900: '#0B0B0F',
          850: '#111116',
          800: '#17171C',
          700: '#23232B',
          600: '#2E2E38',
          500: '#40404C',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        subtle: '0 1px 3px rgba(0, 0, 0, 0.04), 0 2px 6px rgba(0, 0, 0, 0.02)',
        card: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 2px 4px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.06)',
        dropdown: '0 4px 20px -2px rgba(15, 15, 20, 0.08), 0 2px 6px -1px rgba(15, 15, 20, 0.04)',
        glow: '0 0 20px -4px rgba(255, 107, 74, 0.25)',
        'glow-violet': '0 0 20px -4px rgba(124, 58, 237, 0.25)',
        'glow-cyan': '0 0 20px -4px rgba(0, 173, 181, 0.25)',
        'card-elevated': '0 4px 24px -2px rgba(15, 15, 20, 0.06), 0 1px 2px rgba(15, 15, 20, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
