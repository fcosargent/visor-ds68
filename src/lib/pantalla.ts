// Detección de pantallas angostas (celular). Debe coincidir con el @media de styles.css.

export const CONSULTA_MOVIL = '(max-width: 768px)';

/** Verdadero si la pantalla es angosta al momento de la consulta. */
export const esPantallaMovil = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(CONSULTA_MOVIL).matches;
