const currencyFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number): string =>
  `$${currencyFormatter.format(value)}`;
