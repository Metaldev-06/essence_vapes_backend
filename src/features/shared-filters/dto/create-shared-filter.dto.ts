import { ArrayMaxSize, IsArray, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

import { FlavorStyle } from '../../products/enums/flavor-style.enum';
import { Gender } from '../../products/enums/gender.enum';
import { ProductCategory } from '../../products/enums/product-category.enum';
import { ScentStyle } from '../../products/enums/scent-style.enum';

const CATEGORY_OPTIONS = ['todos', ...Object.values(ProductCategory)];
const GENDER_OPTIONS = ['todos', ...Object.values(Gender)];
const SORT_OPTIONS = ['destacados', 'precio-asc', 'precio-desc', 'nombre'];
const STYLE_OPTIONS = Array.from(new Set<string>([...Object.values(ScentStyle), ...Object.values(FlavorStyle)]));

/**
 * Los filtros a compartir. Solo valores que el catálogo ofrece (el endpoint es público: nadie
 * puede guardar cualquier cosa), con largos acotados. `brand` es 'todas' o el nombre de una marca.
 */
export class CreateSharedFilterDto {
  @IsString()
  @MaxLength(80)
  term!: string;

  @IsIn(CATEGORY_OPTIONS)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand!: string;

  @IsIn(GENDER_OPTIONS)
  gender!: string;

  @IsIn(SORT_OPTIONS)
  sort!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsIn(STYLE_OPTIONS, { each: true })
  styles!: string[];

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacityMl!: number | null;
}
