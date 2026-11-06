/**
 * Lista acotada de afirmaciones prohibidas para productos "vapes" (Ley 26.687 y normas
 * complementarias: nada que sugiera que vapear es seguro, saludable o un método de cesación
 * tabáquica sin autorización sanitaria específica para esa afirmación). No es un filtro de IA,
 * es una verificación de texto literal - deliberadamente simple y predecible.
 */
const RESTRICTED_PHRASES = [
  'seguro',
  'saludable',
  'sin riesgo',
  'inofensivo',
  'ayuda a dejar de fumar',
  'recomendado por médicos',
  'libre de riesgos',
];

/** Devuelve la primera frase prohibida encontrada en los textos dados, o null si no hay ninguna. */
export function findRestrictedVapePhrase(
  ...texts: Array<string | string[] | null | undefined>
): string | null {
  const haystack = texts
    .flatMap((text) => (Array.isArray(text) ? text : [text]))
    .filter((text): text is string => typeof text === 'string')
    .join(' ')
    .toLowerCase();

  return RESTRICTED_PHRASES.find((phrase) => haystack.includes(phrase)) ?? null;
}
