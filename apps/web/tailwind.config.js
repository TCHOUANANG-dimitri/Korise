// Thème étendu directement depuis packages/shared/design-tokens.json — source
// unique de vérité pour les couleurs/rayons/espacements, partagée avec le
// mobile (voir documentation/DESIGN_SYSTEM.md).
const tokens = require('../../packages/shared/design-tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: tokens.color.background,
        surface: tokens.color.surface,
        text: tokens.color.text,
        'text-muted': tokens.color.textMuted,
        accent: tokens.color.accent,
        'accent-light': tokens.color.accentLight,
        primary: tokens.color.primary,
        focus: tokens.color.focus,
        success: tokens.color.success,
        warning: tokens.color.warning,
        danger: tokens.color.danger,
        border: tokens.color.border,
      },
      borderRadius: {
        field: `${tokens.radius.field}px`,
        card: `${tokens.radius.card}px`,
        block: `${tokens.radius.block}px`,
      },
      fontFamily: {
        heading: ['var(--font-signika)', 'sans-serif'],
        body: ['var(--font-urbanist)', 'sans-serif'],
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};
