import { ProductCategory } from '../enums/product-category.enum';
import { brandCategoriesFor, capacityUnitFor } from './category-group.helper';

describe('brandCategoriesFor', () => {
  it('groups perfumes and decants together', () => {
    expect(brandCategoriesFor(ProductCategory.PERFUMES)).toEqual([
      ProductCategory.PERFUMES,
      ProductCategory.DECANTS,
    ]);
    expect(brandCategoriesFor(ProductCategory.DECANTS)).toEqual([
      ProductCategory.PERFUMES,
      ProductCategory.DECANTS,
    ]);
  });

  it('keeps vapes and esencias as their own, separate universe', () => {
    expect(brandCategoriesFor(ProductCategory.VAPES)).toEqual([ProductCategory.VAPES]);
    expect(brandCategoriesFor(ProductCategory.ESENCIAS)).toEqual([ProductCategory.ESENCIAS]);
  });
});

describe('capacityUnitFor', () => {
  it('is ml for perfumes, decants and esencias', () => {
    expect(capacityUnitFor(ProductCategory.PERFUMES)).toBe('ml');
    expect(capacityUnitFor(ProductCategory.DECANTS)).toBe('ml');
    expect(capacityUnitFor(ProductCategory.ESENCIAS)).toBe('ml');
  });

  it('is puffs for vapes', () => {
    expect(capacityUnitFor(ProductCategory.VAPES)).toBe('puffs');
  });
});
