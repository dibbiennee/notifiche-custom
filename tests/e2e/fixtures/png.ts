import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, checksum]);
}

/**
 * Costruisce un PNG RGB a tinta unita.
 *
 * Generarlo invece di incollare un base64 preso da internet non è pedanteria:
 * la prima versione di questi test usava una stringa "PNG 1x1" trovata altrove
 * che `createImageBitmap` rifiutava con "The source image could not be decoded",
 * facendo fallire i test per un difetto del fixture e non dell'applicazione.
 */
export function makePng(size = 64, rgb: [number, number, number] = [255, 0, 0]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB senza alpha
  // I restanti byte (compressione, filtro, interlacciamento) restano a 0.

  const pixel = Buffer.from(rgb);
  const row = Buffer.concat([
    Buffer.from([0]), // filtro "None" a inizio riga, richiesto dal formato
    ...Array.from({ length: size }, () => pixel),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
