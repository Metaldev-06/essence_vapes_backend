/**
 * Validación real de contenido (magic number), no solo del `Content-Type` que declara el
 * cliente - un archivo con mimetype falseado no pasa esto aunque sí pase el
 * `FileTypeValidator` de Nest (que solo mira el header declarado). Sin dependencia nueva: solo
 * los 7 tipos que esta app ya acepta (`media.constants.ts`).
 */
function isBoxType(buffer: Buffer, types: readonly string[]): boolean {
  if (buffer.length < 8) return false;
  const boxType = buffer.toString('ascii', 4, 8);
  return types.includes(boxType);
}

const MP4_LIKE_BOX_TYPES = ['ftyp', 'moov', 'free', 'mdat', 'wide', 'skip'] as const;

const SIGNATURE_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8',
  'image/webp': (b) =>
    b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'video/mp4': (b) => isBoxType(b, MP4_LIKE_BOX_TYPES),
  'video/quicktime': (b) => isBoxType(b, MP4_LIKE_BOX_TYPES),
  'video/webm': (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
};

/** `declaredMimeType` es `file.mimetype`, ya restringido por el `FileTypeValidator` de Nest. */
export function matchesFileSignature(buffer: Buffer, declaredMimeType: string): boolean {
  const check = SIGNATURE_CHECKS[declaredMimeType];
  return check ? check(buffer) : false;
}
