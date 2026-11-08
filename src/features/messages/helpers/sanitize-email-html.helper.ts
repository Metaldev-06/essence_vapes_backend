import sanitizeHtml from 'sanitize-html';

/**
 * Sanitiza HTML de un correo ENTRANTE (de un remitente externo, no confiable) antes de que
 * llegue al frontend - saca scripts, handlers inline (`onclick`, etc.), `<iframe>`/`<object>`/
 * `<embed>` anidados, `javascript:`/`data:` en `href`/`src`, y cualquier CSS que intente cargar
 * un recurso externo (`url(...)` de tracking). El frontend además renderiza esto dentro de un
 * `<iframe sandbox>` sin `allow-scripts` como segunda capa - ver `thread-view` en el admin.
 */
export function sanitizeInboundEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'pre',
      'code', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'hr', 'img', 'font',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['color', 'size', 'face'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align'],
      '*': ['style'],
    },
    // Solo colores/tamaños/alineación - nada que pueda cargar un recurso (`background-image`,
    // `url(...)`) o posicionar contenido fuera de su contenedor.
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^[a-zA-Z]+$/],
        'text-align': [/^left$|^right$|^center$|^justify$/],
        'font-weight': [/^\d+$|^bold$|^normal$/],
        'font-style': [/^italic$|^normal$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    disallowedTagsMode: 'discard',
    allowVulnerableTags: false,
    // `target="_blank"` sin `rel="noopener noreferrer"` es un hueco de seguridad clásico
    // (`window.opener`) - se fuerza acá sin depender de que el remitente lo haya puesto.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

/**
 * Sanitiza el HTML que el ADMIN redacta en el editor antes de guardarlo como borrador o
 * mandarlo - más permisivo que el de arriba (es contenido propio), pero igual nunca permite
 * scripts ni handlers inline, para que un pegado accidental de HTML externo no los cuele.
 */
export function sanitizeOutboundEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'span',
      'div', 'h1', 'h2', 'h3',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3,6}$/],
        'text-align': [/^left$|^right$|^center$/],
        'font-weight': [/^\d+$|^bold$|^normal$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
