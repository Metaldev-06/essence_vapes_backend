import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

import { ProductCategory } from '../enums/product-category.enum';

/** Acciones masivas (ver tarea, punto 5.2) - `ids` siempre requerido; el resto son los únicos
 *  campos que la acción masiva puede tocar, todos opcionales (se aplica solo lo que viene). Tope
 *  de 200 a la vez - evita que un bulk gigante bloquee la tabla por mucho tiempo. */
export class BulkUpdateProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;
}
