export interface CannedResponseVariables {
  readonly nombreCliente?: string;
  readonly producto?: string;
  readonly comercio?: string;
}

const VARIABLE_KEYS: Record<keyof CannedResponseVariables, string> = {
  nombreCliente: 'nombre_cliente',
  producto: 'producto',
  comercio: 'comercio',
};

/**
 * Reemplaza `{{variable}}` en el cuerpo de una plantilla con los valores disponibles - una
 * variable sin valor confiable simplemente no se reemplaza (queda el placeholder visible), nunca
 * se completa con un dato inventado. El admin siempre ve el resultado en el editor antes de
 * mandar nada (ver section 13 del pedido: "no enviar plantillas automáticamente sin revisión").
 */
export function applyCannedResponseVariables(
  body: string,
  variables: CannedResponseVariables,
): string {
  return (Object.keys(VARIABLE_KEYS) as (keyof CannedResponseVariables)[]).reduce(
    (result, key) => {
      const value = variables[key];
      if (!value) return result;
      const pattern = new RegExp(`\\{\\{\\s*${VARIABLE_KEYS[key]}\\s*\\}\\}`, 'g');
      return result.replace(pattern, value);
    },
    body,
  );
}
