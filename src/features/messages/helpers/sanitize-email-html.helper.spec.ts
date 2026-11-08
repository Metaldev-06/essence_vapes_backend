import { sanitizeInboundEmailHtml, sanitizeOutboundEmailHtml } from './sanitize-email-html.helper';

describe('sanitizeInboundEmailHtml', () => {
  it('saca <script> por completo', () => {
    const result = sanitizeInboundEmailHtml('<p>Hola</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('Hola');
  });

  it('saca handlers inline como onerror/onclick', () => {
    const result = sanitizeInboundEmailHtml('<img src="x" onerror="alert(1)"><a href="#" onclick="evil()">link</a>');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onclick');
  });

  it('bloquea esquemas javascript: en href', () => {
    const result = sanitizeInboundEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('permite texto, links y formato básico', () => {
    const result = sanitizeInboundEmailHtml('<p>Hola <b>mundo</b>, mirá <a href="https://x.com">esto</a></p>');
    expect(result).toContain('<b>mundo</b>');
    expect(result).toContain('href="https://x.com"');
  });

  it('agrega rel="noopener noreferrer" a los links', () => {
    const result = sanitizeInboundEmailHtml('<a href="https://x.com">click</a>');
    expect(result).toContain('noopener');
    expect(result).toContain('noreferrer');
  });

  it('saca iframes (no se puede incrustar contenido activo externo)', () => {
    const result = sanitizeInboundEmailHtml('<iframe src="https://evil.com"></iframe><p>texto</p>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('texto');
  });
});

describe('sanitizeOutboundEmailHtml', () => {
  it('saca scripts de un pegado accidental de HTML externo', () => {
    const result = sanitizeOutboundEmailHtml('<p>Respuesta</p><script>fetch("https://evil.com")</script>');
    expect(result).not.toContain('<script');
  });

  it('permite el formato básico del editor', () => {
    const result = sanitizeOutboundEmailHtml('<p><b>Hola</b>, <i>gracias</i> por escribir.</p>');
    expect(result).toContain('<b>Hola</b>');
    expect(result).toContain('<i>gracias</i>');
  });
});
