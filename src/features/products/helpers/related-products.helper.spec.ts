import { rankRelated, sharedCount, type RelatedCandidate } from './related-products.helper';

const candidate = (id: string, overrides: Partial<RelatedCandidate> = {}) => ({
  id,
  inStock: true,
  featured: false,
  accords: [],
  styles: [],
  gender: null,
  ...overrides,
});

describe('sharedCount', () => {
  it('cuenta los elementos en común sin distinguir mayúsculas ni espacios', () => {
    expect(sharedCount(['Amaderado', 'dulce ', 'cítrico'], ['amaderado', 'Dulce', 'floral'])).toBe(2);
  });

  it('no cuenta repetidos dos veces y tolera listas vacías o nulas', () => {
    expect(sharedCount(['dulce'], ['dulce', 'Dulce'])).toBe(1);
    expect(sharedCount(null, ['dulce'])).toBe(0);
    expect(sharedCount(undefined, undefined)).toBe(0);
  });
});

describe('rankRelated', () => {
  const current = { accords: ['amaderado', 'dulce', 'especiado'], styles: ['intenso'], gender: 'masculino' };

  it('primero los que más acordes comparten', () => {
    const ranked = rankRelated(current, [
      candidate('uno', { accords: ['amaderado'] }),
      candidate('tres', { accords: ['amaderado', 'dulce', 'especiado'] }),
      candidate('ninguno', { accords: ['acuático'] }),
      candidate('dos', { accords: ['dulce', 'especiado'] }),
    ]);

    expect(ranked.map((c) => c.id)).toEqual(['tres', 'dos', 'uno', 'ninguno']);
  });

  it('con los mismos acordes, desempata por estilos, género, stock y destacado, en ese orden', () => {
    const ranked = rankRelated(current, [
      candidate('destacado', { featured: true }),
      candidate('con-estilo', { styles: ['intenso'] }),
      candidate('agotado-mismo-genero', { gender: 'masculino', inStock: false }),
      candidate('otro-genero', { gender: 'femenino' }),
    ]);

    expect(ranked.map((c) => c.id)).toEqual(['con-estilo', 'agotado-mismo-genero', 'destacado', 'otro-genero']);
  });

  it('con empate total respeta el orden original y no modifica la lista recibida', () => {
    const list = [candidate('a'), candidate('b'), candidate('c')];

    expect(rankRelated({}, list).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});
