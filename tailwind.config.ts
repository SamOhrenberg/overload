import type { Config } from 'tailwindcss';

/** Colors reference the CSS custom properties in app.css so themes switch
 *  with no class changes — tokens are the single source of truth. */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-raised': 'var(--bg-raised)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        accent: {
          DEFAULT: 'var(--accent)',
          press: 'var(--accent-press)',
          soft: 'var(--accent-soft)',
          on: 'var(--on-accent)'
        },
        success: 'var(--success)',
        pr: { DEFAULT: 'var(--pr)', soft: 'var(--pr-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        fg: 'var(--text)',
        'fg-2': 'var(--text-2)',
        'fg-muted': 'var(--text-muted)',
        goal: {
          strength: 'var(--goal-strength)',
          'strength-soft': 'var(--goal-strength-soft)',
          endurance: 'var(--goal-endurance)',
          'endurance-soft': 'var(--goal-endurance-soft)',
          stamina: 'var(--goal-stamina)',
          'stamina-soft': 'var(--goal-stamina-soft)'
        }
      },
      fontFamily: {
        ui: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        display: ['"Hanken Grotesk"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace']
      },
      fontSize: {
        'display-xl': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-l': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-m': ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '650' }],
        h1: ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        h2: ['1.1875rem', { lineHeight: '1.25', fontWeight: '650' }],
        label: ['0.875rem', { lineHeight: '1.3', letterSpacing: '0.01em', fontWeight: '600' }],
        caption: ['0.8125rem', { lineHeight: '1.35', letterSpacing: '0.01em', fontWeight: '500' }],
        micro: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '600' }],
        metric: ['0.9375rem', { lineHeight: '1.3' }]
      },
      borderRadius: { sm: '8px', md: '14px', lg: '20px', xl: '28px' },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)'
      },
      boxShadow: {
        e1: '0 1px 2px hsl(220 40% 2% / .4)',
        e2: '0 2px 8px hsl(220 40% 2% / .5)',
        e3: '0 -8px 32px hsl(220 40% 2% / .6)',
        e4: '0 8px 24px hsl(220 40% 2% / .7)'
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(.2,.8,.2,1)',
        in: 'cubic-bezier(.4,0,1,1)'
      },
      transitionDuration: { fast: '120ms', med: '220ms', slow: '360ms' }
    }
  },
  plugins: []
} satisfies Config;
