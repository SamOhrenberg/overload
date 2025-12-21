import type { Config } from 'tailwindcss';

/**
 * Base theme. Dark-first. These tokens are the starting palette;
 * the full design-system values are refined during the UI phase.
 */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d10',
          raised: '#14181d',
          overlay: '#1b2027'
        },
        border: '#262c34',
        content: {
          DEFAULT: '#e7edf3',
          muted: '#9aa6b2',
          faint: '#6b7682'
        },
        accent: {
          DEFAULT: '#4f8cff',
          strong: '#2f6ffb'
        },
        strength: '#ff6b57',
        endurance: '#38c7a0',
        stamina: '#f2b134',
        success: '#36c76f',
        warning: '#f2b134',
        danger: '#ef4e5a'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config;
