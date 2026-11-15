/** Lo que se compara entre dos productos para decidir cuán parecidos son. */
export interface SimilarityProfile {
  readonly accords?: readonly string[] | null;
  readonly styles?: readonly string[] | null;
  readonly gender?: string | null;
  readonly featured?: boolean;
}

export interface RelatedCandidate extends SimilarityProfile {
  /** Si la presentación que se va a mostrar tiene stock. */
  readonly inStock: boolean;
}

/** Cuántos elementos distintos comparten dos listas, sin distinguir mayúsculas ni espacios. */
export function sharedCount(a?: readonly string[] | null, b?: readonly string[] | null): number {
  const normalize = (value: string) => value.trim().toLowerCase();
  const left = new Set((a ?? []).map(normalize));
  return new Set((b ?? []).map(normalize).filter((value) => left.has(value))).size;
}

/**
 * Ordena los candidatos de "También te puede gustar" del más al menos parecido al producto
 * actual. Criterios, en este orden de importancia:
 *   1. acordes compartidos (lo que promete el subtítulo de la sección),
 *   2. estilos compartidos (fresco, dulce, amaderado...),
 *   3. mismo género,
 *   4. con stock antes que agotados,
 *   5. destacados.
 * Con empate en todo se respeta el orden de entrada (el sort es estable).
 */
export function rankRelated<T extends RelatedCandidate>(
  current: SimilarityProfile,
  candidates: readonly T[],
): T[] {
  const score = (candidate: T): number[] => [
    sharedCount(current.accords, candidate.accords),
    sharedCount(current.styles, candidate.styles),
    current.gender && candidate.gender === current.gender ? 1 : 0,
    candidate.inStock ? 1 : 0,
    candidate.featured ? 1 : 0,
  ];

  return candidates
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((a, b) => {
      for (let index = 0; index < a.score.length; index += 1) {
        if (a.score[index] !== b.score[index]) return b.score[index] - a.score[index];
      }
      return 0;
    })
    .map(({ candidate }) => candidate);
}
