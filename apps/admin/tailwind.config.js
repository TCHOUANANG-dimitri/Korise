// Même source de tokens que apps/web (packages/shared/design-tokens.json), mais des
// composants propres à apps/admin — pas de réutilisation des composants de apps/web, pensés
// pour un tout autre usage (saisie rapide vs consultation de données). Voir opencode.md
// chantier D.4 : palette Korise reprise pour la cohérence de marque, l'accent orange réservé
// aux actions (pas de fond coloré).
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
    },
  },
  plugins: [],
};
