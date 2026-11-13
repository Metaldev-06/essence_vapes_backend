import { IsEnum, IsOptional } from 'class-validator';

import { ProductCategory } from '../enums/product-category.enum';

/** `GET /products/brands` y `GET /products/capacities` - categoría opcional para acotar el
 *  resultado (ver `category-group.helper.ts`); sin categoría, se mantiene el comportamiento
 *  histórico de devolver el universo completo del catálogo activo. */
export class CategoryQueryDto {
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;
}
