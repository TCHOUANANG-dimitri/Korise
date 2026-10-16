// Filtres de saisie pour les champs numériques : appliqués dans onChange, ils empêchent
// physiquement de taper une lettre (le backend refuse aussi, voir app/schemas/validators.py).

/** Chiffres uniquement : PIN, montants FCFA, quantités. */
export const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, '');

/** Téléphone : chiffres, avec un « + » accepté seulement en tête (ex. +237690000000). */
export const phoneOnly = (value: string): string => {
  const trimmed = value.trimStart();
  return (trimmed.startsWith('+') ? '+' : '') + digitsOnly(trimmed);
};

export const PHONE_MAX_LENGTH = 16;
export const PHONE_PLACEHOLDER = 'ex. 690000000';
