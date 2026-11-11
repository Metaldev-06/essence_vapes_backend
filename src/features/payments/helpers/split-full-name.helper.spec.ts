import { splitFullName } from './split-full-name.helper';

describe('splitFullName', () => {
  it('separa nombre y apellido en el primer espacio', () => {
    expect(splitFullName('Juan Pérez')).toEqual({ firstName: 'Juan', lastName: 'Pérez' });
  });

  it('conserva el resto del nombre completo como apellido con múltiples palabras', () => {
    expect(splitFullName('María José García López')).toEqual({
      firstName: 'María',
      lastName: 'José García López',
    });
  });

  it('un nombre sin espacio no inventa un apellido', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
  });

  it('recorta espacios extra', () => {
    expect(splitFullName('  Ana   Gómez  ')).toEqual({ firstName: 'Ana', lastName: 'Gómez' });
  });
});
