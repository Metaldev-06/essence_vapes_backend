import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

import type { TopProductPoint } from '../orders.service';

export interface ExportMeta {
  readonly generatedAt: Date;
  readonly periodLabel: string;
  readonly fromUtc: string;
  readonly toUtc: string;
}

const categoryLabel = (category: string | null): string => {
  if (!category) return '';
  const labels: Record<string, string> = {
    perfumes: 'Perfumes',
    decants: 'Decants',
    vapes: 'Vapes',
    esencias: 'Esencias',
    sin_categoria: 'Sin categoría',
  };
  return labels[category] ?? category;
};

const toRow = (point: TopProductPoint) => ({
  Producto: point.productName,
  Variante: point.variantLabel ?? '',
  Marca: point.brand ?? '',
  Categoría: categoryLabel(point.category),
  'Unidades vendidas': point.unitsSold,
  Ingresos: point.revenueValue,
  'Participación %': Number(point.sharePercent.toFixed(2)),
  Margen: point.marginValue ?? '',
  'Margen %': point.marginPercent != null ? Number(point.marginPercent.toFixed(2)) : '',
  'Stock actual': point.currentStock ?? '',
});

/**
 * Exportación a Excel (ver tarea, punto 4.4) - los importes van como números reales en las
 * celdas (no texto formateado "$1.234"), tal como pide la tarea. Metadata (fecha de generación,
 * período, moneda) como filas de encabezado arriba de la tabla, no en el nombre del archivo
 * solamente.
 */
export const buildTopProductsXlsx = (rows: readonly TopProductPoint[], meta: ExportMeta): Buffer => {
  const metaRows = [
    [`Generado: ${meta.generatedAt.toISOString()}`],
    [`Período: ${meta.periodLabel} (${meta.fromUtc} a ${meta.toUtc})`],
    [`Moneda: ARS`],
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(metaRows);
  XLSX.utils.sheet_add_json(sheet, rows.map(toRow), { origin: -1 });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

/** Exportación a PDF (ver tarea, punto 4.4) - tabla simple, una página, pensada para imprimir o
 *  adjuntar, no para análisis (para eso está el Excel/CSV). */
export const buildTopProductsPdf = (
  rows: readonly TopProductPoint[],
  meta: ExportMeta,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Productos - Essence Vapes', { align: 'left' });
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(`Generado: ${meta.generatedAt.toLocaleString('es-AR')}`)
      .text(`Período: ${meta.periodLabel} (${meta.fromUtc} a ${meta.toUtc})`)
      .text('Moneda: ARS')
      .fillColor('#000000')
      .moveDown(1);

    const columns = ['Producto', 'Variante', 'Marca', 'Categoría', 'Unid.', 'Ingresos', 'Part. %', 'Margen', 'Stock'];
    const widths = [170, 80, 80, 80, 45, 70, 55, 70, 50];
    const startX = doc.x;
    let y = doc.y;

    const drawRow = (cells: string[], bold: boolean): void => {
      doc.fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      let x = startX;
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, { width: widths[i], ellipsis: true });
        x += widths[i];
      });
      y += 16;
    };

    drawRow(columns, true);
    doc.moveTo(startX, y).lineTo(startX + widths.reduce((a, b) => a + b, 0), y).strokeColor('#cccccc').stroke();
    y += 4;

    for (const point of rows) {
      if (y > doc.page.height - 50) {
        doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
        y = doc.y;
      }
      drawRow(
        [
          point.productName,
          point.variantLabel ?? '',
          point.brand ?? '',
          categoryLabel(point.category),
          String(point.unitsSold),
          `$${point.revenueValue.toLocaleString('es-AR')}`,
          `${point.sharePercent.toFixed(1)}%`,
          point.marginValue != null ? `$${point.marginValue.toLocaleString('es-AR')}` : '—',
          point.currentStock != null ? String(point.currentStock) : '—',
        ],
        false,
      );
    }

    doc.end();
  });
