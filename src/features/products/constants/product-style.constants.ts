import { FlavorStyle } from '../enums/flavor-style.enum';
import { ScentStyle } from '../enums/scent-style.enum';

/**
 * A product's `styles` field holds one vocabulary or the other depending on its category -
 * `ScentStyle` for perfumes/decants, `FlavorStyle` for vapes/esencias (see `products-filters`
 * on the frontend, which shows the matching pill set per category). Validation below is a flat
 * whitelist across both: which vocabulary is "correct" for a given product is a UI-level concern,
 * not enforced at this layer (consistent with how category-specific fields like the decant/vape
 * ones already work elsewhere in this DTO).
 */
export type ProductStyle = ScentStyle | FlavorStyle;

export const ALL_PRODUCT_STYLE_VALUES: readonly string[] = [
  ...Object.values(ScentStyle),
  ...Object.values(FlavorStyle),
];
