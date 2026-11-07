import { describe, expect, it } from '@jest/globals';

import {
  computePwnedRangeQuery,
  responseContainsSuffix,
  validatePasswordShape,
} from './password-policy.helper';

describe('validatePasswordShape', () => {
  it('rechaza menos de 8 caracteres', () => {
    expect(validatePasswordShape('corta1').valid).toBe(false);
  });

  it('acepta una frase larga sin mayúsculas/símbolos (política moderna, no la del registro)', () => {
    expect(validatePasswordShape('una frase larga y facil de recordar').valid).toBe(true);
  });

  it('acepta hasta 128 caracteres', () => {
    expect(validatePasswordShape('a'.repeat(128)).valid).toBe(true);
  });

  it('rechaza más de 128 caracteres en vez de truncar en silencio', () => {
    expect(validatePasswordShape('a'.repeat(129)).valid).toBe(false);
  });
});

describe('computePwnedRangeQuery', () => {
  it('el prefijo siempre tiene 5 caracteres hex (esquema de k-anonimato de HIBP)', () => {
    const { prefix } = computePwnedRangeQuery('password123');
    expect(prefix).toMatch(/^[0-9A-F]{5}$/);
  });

  it('prefijo + sufijo reconstruyen el SHA-1 completo de 40 caracteres', () => {
    const { prefix, suffix } = computePwnedRangeQuery('password123');
    expect((prefix + suffix).length).toBe(40);
  });
});

describe('responseContainsSuffix', () => {
  it('encuentra el sufijo en una respuesta multilínea típica de HIBP', () => {
    const body = 'AAAA:3\r\nBBBB:10\r\nCCCC:0';
    expect(responseContainsSuffix(body, 'BBBB')).toBe(true);
  });

  it('no confunde un sufijo que es prefijo de otro (match exacto, no substring)', () => {
    const body = 'BBBBCCCC:5';
    expect(responseContainsSuffix(body, 'BBBB')).toBe(false);
  });

  it('devuelve false cuando no hay coincidencia', () => {
    expect(responseContainsSuffix('AAAA:1', 'ZZZZ')).toBe(false);
  });
});
