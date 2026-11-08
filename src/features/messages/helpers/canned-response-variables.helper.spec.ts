import { applyCannedResponseVariables } from './canned-response-variables.helper';

describe('applyCannedResponseVariables', () => {
  it('reemplaza una variable con un valor disponible', () => {
    const result = applyCannedResponseVariables('Hola {{nombre_cliente}}, gracias por escribir.', {
      nombreCliente: 'Juan',
    });
    expect(result).toBe('Hola Juan, gracias por escribir.');
  });

  it('reemplaza varias variables distintas', () => {
    const result = applyCannedResponseVariables(
      'Hola {{nombre_cliente}}, el {{producto}} está disponible en {{comercio}}.',
      { nombreCliente: 'Ana', producto: 'Le Male Elixir', comercio: 'Essence Vapes' },
    );
    expect(result).toBe('Hola Ana, el Le Male Elixir está disponible en Essence Vapes.');
  });

  it('deja el placeholder intacto si no hay un valor confiable para esa variable', () => {
    const result = applyCannedResponseVariables('Hola {{nombre_cliente}}, gracias.', {});
    expect(result).toBe('Hola {{nombre_cliente}}, gracias.');
  });

  it('tolera espacios dentro de las llaves', () => {
    const result = applyCannedResponseVariables('Hola {{ nombre_cliente }}!', { nombreCliente: 'Lu' });
    expect(result).toBe('Hola Lu!');
  });

  it('no inventa un valor para una variable sin dato (nunca envía algo fabricado)', () => {
    const result = applyCannedResponseVariables('{{producto}} - {{nombre_cliente}}', {
      nombreCliente: 'Caro',
    });
    expect(result).toBe('{{producto}} - Caro');
  });
});
