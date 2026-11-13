import { ProductCategory } from '../enums/product-category.enum';

/**
 * Perfumes y decants comparten el mismo universo de marcas (un decant casi siempre es de una
 * marca de perfume ya existente) - vapes y esencias tienen cada uno su propio universo, distinto
 * entre sí. Usado para acotar el filtro de Marca a lo que realmente existe dentro de la
 * categoría elegida (ver tarea del usuario, punto "Marcas").
 */
export const brandCategoriesFor = (category: ProductCategory): readonly ProductCategory[] =>
  category === ProductCategory.PERFUMES || category === ProductCategory.DECANTS
    ? [ProductCategory.PERFUMES, ProductCategory.DECANTS]
    : [category];

/**
 * Unidad de capacidad por categoría - perfumes/decants/esencias se miden en ml, vapes en
 * cantidad de puffs. No hay una unidad común para "todas las categorías", por eso el filtro de
 * Capacidad solo se arma cuando el storefront ya eligió una categoría puntual.
 */
export const capacityUnitFor = (category: ProductCategory): 'ml' | 'puffs' =>
  category === ProductCategory.VAPES ? 'puffs' : 'ml';
