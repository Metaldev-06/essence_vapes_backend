import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { Sillage } from '../enums/sillage.enum';
import type {
  DayUsage,
  FragranceNotes,
  OccasionRatings,
  SeasonUsage,
} from '../interfaces/product-attributes.interface';

/**
 * Subset of CreateProductDto the AI can plausibly know from public sources, plus
 * `fuentes`/`datosNoConfirmados` which are NOT product fields - they exist only so the
 * admin can judge the suggestion before saving it. Never persisted as-is: price, stock,
 * category, accent color, images and badges stay manual (business decisions, not facts
 * about the fragrance).
 */
export interface FragranceAiSuggestion {
  subtitle?: string;
  notes?: string[];
  accords?: string[];
  fragranceNotes?: FragranceNotes;
  mood?: string[];
  year?: number;
  origin?: string;
  gender?: Gender;
  sillage?: Sillage;
  longevity?: Longevity;
  rating?: number;
  ratingCount?: number;
  seasonUsage?: SeasonUsage;
  dayUsage?: DayUsage;
  occasions?: OccasionRatings;
  fuentes: string[];
  datosNoConfirmados: string[];
}

/** One candidate edition the admin must pick between when brand+name alone is ambiguous. */
export interface FragranceAiCandidate {
  /** Human-readable, e.g. "Born In Roma Donna Intense (edición para mujer)". */
  label: string;
  brand: string;
  name: string;
}

export type FragranceAiLookupResult =
  | { status: 'ambiguous'; candidates: FragranceAiCandidate[] }
  | { status: 'ok'; suggestion: FragranceAiSuggestion };
