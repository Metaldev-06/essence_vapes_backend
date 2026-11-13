import { parseCapacityMl, parsePuffCount } from './capacity.helper';

describe('parseCapacityMl', () => {
  it('parses a plain "Xml" label', () => {
    expect(parseCapacityMl('5ml')).toBe(5);
    expect(parseCapacityMl('125 ML')).toBe(125);
    expect(parseCapacityMl('2,5ml')).toBe(2.5);
  });

  it('returns null for anything else', () => {
    expect(parseCapacityMl('600 puffs')).toBeNull();
    expect(parseCapacityMl('600')).toBeNull();
    expect(parseCapacityMl(null)).toBeNull();
    expect(parseCapacityMl(undefined)).toBeNull();
    expect(parseCapacityMl('')).toBeNull();
  });
});

describe('parsePuffCount', () => {
  it('parses "N puffs"/"Npuff" labels', () => {
    expect(parsePuffCount('600 puffs')).toBe(600);
    expect(parsePuffCount('6000puff')).toBe(6000);
    expect(parsePuffCount('  3000 Puffs  ')).toBe(3000);
  });

  it('parses a bare number as puffs', () => {
    expect(parsePuffCount('600')).toBe(600);
  });

  it('returns null for anything else', () => {
    expect(parsePuffCount('5ml')).toBeNull();
    expect(parsePuffCount(null)).toBeNull();
    expect(parsePuffCount(undefined)).toBeNull();
    expect(parsePuffCount('')).toBeNull();
  });
});
