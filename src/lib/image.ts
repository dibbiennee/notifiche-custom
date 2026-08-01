'use client';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg'];

/**
 * Ritaglia al centro in quadrato, appiattisce su un colore opaco e produce le due
 * dimensioni richieste dal manifest. L'appiattimento serve perché la trasparenza
 * sulla Home di iOS viene resa nera.
 */
export async function processIcon(
  file: File,
  background: string,
): Promise<{ 192: string; 512: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Serve un PNG o un JPEG');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Immagine troppo grande: massimo 5 MB');
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const render = (size: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile in questo browser');

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    return canvas.toDataURL('image/png').split(',')[1]!;
  };

  const result = { 192: render(192), 512: render(512) };
  bitmap.close();
  return result;
}
