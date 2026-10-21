// Shared byte validation. Format checks are not an antivirus or content review.
export function validateFile(bytes, filename, mime) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > 900000) throw Error('Arquivo vazio, inválido ou acima de 900 KB.');
  if (typeof filename !== 'string' || filename.length < 1 || filename.length > 200 || /[\x00-\x1f/\\]/.test(filename)) throw Error('Nome de arquivo inválido.');
  const starts = values => values.every((v, i) => bytes[i] === v);
  const ascii = (start, end) => new TextDecoder('latin1').decode(bytes.slice(start, end));
  const valid = mime === 'application/pdf' ? /\.pdf$/i.test(filename) && ascii(0,5)==='%PDF-' && ascii(Math.max(0,bytes.length-1024)).includes('%%EOF')
    : mime === 'image/png' ? /\.png$/i.test(filename) && starts([137,80,78,71,13,10,26,10]) && ascii(12,16)==='IHDR'
    : mime === 'image/jpeg' ? /\.jpe?g$/i.test(filename) && starts([255,216,255]) && bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217
    : mime === 'image/webp' ? /\.webp$/i.test(filename) && ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP' : false;
  if (!valid) throw Error('Conteúdo, extensão e formato do arquivo não correspondem.');
  if (mime === 'application/pdf' && /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|XFA)\b/.test(ascii(0,bytes.length))) throw Error('PDF com conteúdo ativo ou incorporado não permitido.');
  return {mime, size:bytes.length};
}
