const ML_LABEL_PATTERN = /^(\d+(?:[.,]\d+)?)\s*ml$/i;

/**
 * Pulls the ml number out of a variant label like "5ml" or "125 ML" - labels are free text
 * (see CreateVariantDto), so anything that doesn't match this shape (vape puff counts, etc.)
 * just isn't filterable/listable by capacity.
 */
export const parseCapacityMl = (label: string | null | undefined): number | null => {
  if (!label) return null;
  const match = ML_LABEL_PATTERN.exec(label.trim());
  if (!match) return null;
  return Number(match[1].replace(',', '.'));
};

const PUFF_LABEL_PATTERN = /^(\d+)\s*puffs?$/i;
const BARE_NUMBER_PATTERN = /^\d+$/;

/**
 * Pulls the puff count out of a vape variant label - accepts both "600 puffs"/"600puff" and a
 * bare "600" (there's no other unit a vape size variant would reasonably use), same best-effort
 * "unparseable labels just don't show up in the filter" philosophy as `parseCapacityMl`.
 */
export const parsePuffCount = (label: string | null | undefined): number | null => {
  if (!label) return null;
  const trimmed = label.trim();
  const match = PUFF_LABEL_PATTERN.exec(trimmed);
  if (match) return Number(match[1]);
  if (BARE_NUMBER_PATTERN.test(trimmed)) return Number(trimmed);
  return null;
};
