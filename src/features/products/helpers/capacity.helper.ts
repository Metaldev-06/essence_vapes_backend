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
