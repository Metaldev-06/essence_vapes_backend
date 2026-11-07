import { describe, expect, it } from '@jest/globals';

import {
  generateNumericCode,
  generateOpaqueToken,
  hashSecret,
  secretMatches,
} from './challenge-secret.helper';

describe('generateNumericCode', () => {
  it('siempre devuelve 6 dígitos, con ceros a la izquierda si hace falta', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateNumericCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('generateOpaqueToken', () => {
  it('genera tokens distintos en llamadas sucesivas (alta entropía, sin colisiones prácticas)', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(50);
  });

  it('no usa caracteres que entren en conflicto con el separador "." de las autorizaciones', () => {
    expect(generateOpaqueToken()).not.toContain('.');
  });
});

describe('hashSecret / secretMatches', () => {
  const serverSecret = 'un-secreto-de-servidor-de-prueba';

  it('el mismo secreto + la misma clave de servidor siempre coinciden', () => {
    const code = '123456';
    const hash = hashSecret(code, serverSecret);
    expect(secretMatches(code, serverSecret, hash)).toBe(true);
  });

  it('un valor distinto nunca coincide', () => {
    const hash = hashSecret('123456', serverSecret);
    expect(secretMatches('654321', serverSecret, hash)).toBe(false);
  });

  it('la misma entrada con una clave de servidor distinta no coincide (rotación de secreto)', () => {
    const hash = hashSecret('123456', serverSecret);
    expect(secretMatches('123456', 'otra-clave-de-servidor', hash)).toBe(false);
  });

  it('nunca lanza con un hash de largo distinto (hash corrupto/otro algoritmo)', () => {
    expect(secretMatches('123456', serverSecret, 'no-es-un-hash-hex-valido')).toBe(false);
  });
});
